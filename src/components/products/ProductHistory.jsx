import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, runTransaction, deleteDoc, increment } from "firebase/firestore";
import { db } from '../../firebase/config';
import { History, MessageSquare, PlusCircle, X, Save, ArrowUp, ArrowDown, Minus, Trash2, Edit, AlertTriangle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { sileo } from 'sileo';
import ConfirmModal from '../ui/ConfirmModal';
import { formatDateTime, todayStrPY, toInputDatePY } from '../../utils/dateUtils';
import { planBatchConsumption } from '../../utils/fifoUtils';

export default function ProductHistory({ productId, onStockUpdate }) {
  const { userData } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [productData, setProductData] = useState(null);
  const [editingLog, setEditingLog] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  // --- PROVEEDORES ---
  const [providers, setProviders] = useState([]);
  const [providerSearch, setProviderSearch] = useState('');
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [supplier, setSupplier] = useState('');

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const snap = await getDocs(collection(db, 'providers'));
        setProviders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('Error fetching providers:', e);
      }
    };
    fetchProviders();
  }, []);

  // --- PAGINACIÓN HISTORIAL ---
  const [histPage, setHistPage] = useState(1);
  const histPerPage = 5;

  // Helper: fecha de hoy en formato yyyy-MM-dd para Paraguay
  const todayStr = () => todayStrPY();

  const [formData, setFormData] = useState({
    variantIndex: -1,
    type: 'add',
    quantity: 0,
    reason: 'Ajuste de Inventario',
    note: '',
    date: todayStr(),
  });

  // Cargar Historial
  const fetchHistory = async () => {
    if (!productId) return;
    try {
      setLoading(true);
      const q = query(collection(db, "inventory_logs"), where("productId", "==", productId));
      const querySnapshot = await getDocs(q);
      const logsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      logsData.sort((a, b) => {
        const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return dateB - dateA;
      });
      setLogs(logsData);
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchHistory();
    const loadProduct = async () => {
      if (productId) {
        const docSnap = await getDoc(doc(db, "products", productId));
        if (docSnap.exists()) setProductData(docSnap.data());
      }
    };
    loadProduct();
  }, [productId]);

  // ELIMINAR REGISTRO
  const handleDeleteLog = (logId) => {
    setConfirmModal({
      title: '¿Eliminar este registro?',
      description: 'Solo se borra el registro visual. El stock actual del producto no se modifica.',
      confirmText: 'Sí, eliminar',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "inventory_logs", logId));
          fetchHistory();
          sileo.success({ title: 'Registro eliminado del historial.' });
        } catch (e) {
          console.error(e);
          sileo.error({ title: 'Error al eliminar el registro.' });
        }
      },
    });
  };

  // ABRIR MODAL PARA EDITAR
  const handleOpenEdit = (log) => {
    let vIndex = -1;
    if (productData?.variants) {
      vIndex = productData.variants.findIndex(v => log.variantName.includes(v.name));
    }
    let type = 'add';
    let qty = Math.abs(log.change);
    if (log.change < 0) type = 'subtract';

    setEditingLog(log);
    setSupplier(log.supplierName || log.supplier || '');

    // Al editar, mostrar la fecha original del log como fecha editable (resolviendo error logDate indefinida)
    const logDate = log.date?.toDate ? log.date.toDate() : new Date(log.date);
    const logDateStr = toInputDatePY(logDate);
    setFormData({ variantIndex: vIndex, type, quantity: qty, reason: log.reason, note: log.note || '', date: logDateStr });
    setShowModal(true);
  };

  // ABRIR MODAL PARA CREAR
  const handleOpenCreate = () => {
    setEditingLog(null);
    setSupplier('');
    setFormData({ variantIndex: -1, type: 'add', quantity: 0, reason: 'Ajuste de Inventario', note: '', date: todayStr() });
    setShowModal(true);
  };

  // GUARDAR MOVIMIENTO
  const handleSaveMovement = async () => {
    if (!formData.quantity || formData.quantity < 0)
      return sileo.warning({ title: 'Ingrese una cantidad válida.' });

    try {
      await sileo.promise(
        runTransaction(db, async (transaction) => {
          const productRef = doc(db, "products", productId);
          const sfDoc = await transaction.get(productRef);
          if (!sfDoc.exists()) throw new Error("Producto no existe");

          const prod = sfDoc.data();
          let currentStock = 0;
          let variantName = prod.name;
          let targetVariantIndex = formData.variantIndex;

          if (targetVariantIndex >= 0 && prod.variants) {
            const variant = prod.variants[targetVariantIndex];
            currentStock = parseInt(variant.stock) || 0;
            variantName = `${prod.name} / ${variant.name}`;
          } else {
            currentStock = parseInt(prod.current_stock) || 0;
          }

          if (editingLog) {
            currentStock = currentStock - editingLog.change;
          }

          let change = 0;
          let newStock = 0;
          const qty = parseInt(formData.quantity);

          if (formData.type === 'add') {
            newStock = currentStock + qty;
            change = qty;
          } else if (formData.type === 'subtract') {
            newStock = Math.max(0, currentStock - qty);
            change = -qty;
          } else if (formData.type === 'adjust') {
            newStock = qty;
            change = newStock - currentStock;
          }

          // Lotes FIFO: las salidas descuentan de los lotes más antiguos; al editar,
          // primero se devuelve lo que ese mismo registro había descontado antes.
          const oldConsumption = editingLog?.batchConsumption || [];
          const restored = {};
          oldConsumption.forEach(({ batchId, qty: q }) => { restored[batchId] = (restored[batchId] || 0) + q; });
          const consumption = change < 0
            ? await planBatchConsumption(productId, targetVariantIndex, Math.abs(change), restored)
            : [];
          oldConsumption.forEach(({ batchId, qty: q }) => {
            transaction.update(doc(db, 'inventory_batches', batchId), { qtyRemaining: increment(q) });
          });
          consumption.forEach(({ batchId, qty: q }) => {
            transaction.update(doc(db, 'inventory_batches', batchId), { qtyRemaining: increment(-q) });
          });

          if (targetVariantIndex >= 0 && prod.variants) {
            const newVariants = [...prod.variants];
            newVariants[targetVariantIndex].stock = newStock;
            transaction.update(productRef, { variants: newVariants });
          } else {
            transaction.update(productRef, { current_stock: newStock });
          }

          // Para EDICIONES: usar la fecha seleccionada con mediodía local (fecha retroactiva)
          // Para NUEVOS registros: usar la fecha seleccionada pero con la hora ACTUAL del sistema
          const [sy, sm, sd] = formData.date.split('-').map(Number);
          const now = new Date();
          const isToday = (
            now.getFullYear() === sy &&
            (now.getMonth() + 1) === sm &&
            now.getDate() === sd
          );
          let selectedDate;
          if (!editingLog && isToday) {
            // Nuevo registro del día de hoy → hora exacta actual
            selectedDate = now;
          } else {
            // Edición o fecha retroactiva → mediodía local para evitar desfase de día
            selectedDate = new Date(sy, sm - 1, sd, 12, 0, 0, 0);
          }

          const logPayload = {
            date: selectedDate, variantName, reason: formData.reason,
            note: formData.note,
            change, finalStock: newStock,
            batchConsumption: consumption,
          };

          if (formData.type === 'add' || formData.reason === 'Devolución') {
            logPayload.supplierName = supplier || '';
            logPayload.supplier = supplier || '';
            if (supplier) {
              logPayload.note = `${formData.note ? formData.note + ' — ' : ''}Proveedor: ${supplier}`;
            }
          }

          if (editingLog) {
            const logRef = doc(db, "inventory_logs", editingLog.id);
            transaction.update(logRef, {
              ...logPayload,
              user: userData?.name || 'Usuario (Editado)'
            });
          } else {
            const newLogRef = doc(collection(db, "inventory_logs"));
            transaction.set(newLogRef, {
              productId,
              ...logPayload,
              user: userData?.name || 'Usuario'
            });
          }
        }),
        {
          loading: { title: editingLog ? 'Actualizando movimiento...' : 'Registrando movimiento...' },
          success: { title: editingLog ? 'Registro actualizado y stock corregido.' : 'Movimiento registrado con éxito.' },
          error:   { title: 'Error al guardar el movimiento.' },
        }
      );

      setShowModal(false);
      // Si es nuevo movimiento, ir a pág 1 (aparece primero por orden desc)
      if (!editingLog) setHistPage(1);
      fetchHistory();
      if (onStockUpdate) onStockUpdate();

    } catch (error) {
      console.error("Error transacción:", error);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return formatDateTime(date);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden mt-8">

      {/* Modal de confirmación para eliminar */}
      {confirmModal && (
        <ConfirmModal {...confirmModal} onClose={() => setConfirmModal(null)} />
      )}

      <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-white flex justify-between items-center">
        <h3 className="font-bold text-emerald-800 flex items-center gap-2">
          <History size={18} className="text-emerald-600 animate-pulse" /> Historial y Notas
        </h3>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-100 font-bold text-gray-700 flex items-center gap-2"
        >
          <PlusCircle size={14} /> AGREGAR NOTA / AJUSTE
        </button>
      </div>

      {/* MODAL MOVIMIENTO */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h4 className="font-bold text-gray-800">
                {editingLog ? 'Editar Movimiento' : 'Registrar Movimiento'}
              </h4>
              <button type="button" onClick={() => setShowModal(false)}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            {editingLog && (
              <div className="mb-4 bg-yellow-50 text-yellow-800 text-xs p-3 rounded flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                <p>Atención: Al editar este registro, el stock actual del producto se recalculará automáticamente para reflejar el cambio.</p>
              </div>
            )}

            <div className="space-y-4">

              {/* FECHA DEL MOVIMIENTO — editable para cargas retroactivas */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Fecha del Movimiento
                </label>
                <input
                  type="date"
                  className="w-full border rounded p-2 text-sm focus:outline-none focus:border-primary"
                  value={formData.date}
                  max={todayStr()}
                  onChange={e => setFormData({ ...formData, date: e.target.value })}
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Podés cambiar la fecha si el movimiento ocurrió en un día anterior.
                </p>
              </div>
              {productData?.variants?.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Variante Afectada</label>
                  <select
                    className="w-full border rounded p-2"
                    value={formData.variantIndex}
                    onChange={e => setFormData({ ...formData, variantIndex: parseInt(e.target.value) })}
                    disabled={!!editingLog}
                  >
                    <option value={-1}>-- Seleccionar Variante --</option>
                    {productData.variants.map((v, i) => (
                      <option key={i} value={i}>{v.name} (Stock: {v.stock})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo Acción</label>
                  <select
                    className="w-full border rounded p-2"
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                  >
                    <option value="add">Entrada (+)</option>
                    <option value="subtract">Salida (-)</option>
                    <option value="adjust">Corrección (=)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Cantidad</label>
                  <input
                    type="number"
                    className="w-full border rounded p-2"
                    value={formData.quantity}
                    onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Motivo</label>
                <select
                  className="w-full border rounded p-2"
                  value={formData.reason}
                  onChange={e => setFormData({ ...formData, reason: e.target.value })}
                >
                  {editingLog?.reason === 'Compra a Proveedor' && <option>Compra a Proveedor</option>}
                  <option>Ajuste de Inventario</option>
                  <option>Pérdida / Daño</option>
                  <option>Devolución</option>
                  <option>Otro</option>
                </select>
              </div>

              {formData.type === 'add' && !editingLog && (
                <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs p-3 rounded">
                  ¿Es una compra de mercadería? Registrala en{' '}
                  {userData?.role === 'admin'
                    ? <Link to="/articulos/entrada" className="font-bold underline">Entrada Mercadería</Link>
                    : <strong>Entrada Mercadería</strong>}
                  {' '}para que quede con su costo y proveedor (FIFO). Acá solo se cargan ajustes y correcciones.
                </div>
              )}

              {(formData.reason === 'Devolución' || formData.reason === 'Compra a Proveedor') && (
                <div className="relative">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Proveedor *</label>
                  <div 
                    onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                    className={`w-full border rounded p-2 text-sm focus:outline-none transition-all cursor-pointer flex justify-between items-center select-none bg-white
                      ${supplier ? 'border-blue-300 bg-blue-50 text-blue-800 font-bold' : 'border-gray-200'}`}
                  >
                    <span className="truncate">{supplier || 'Seleccionar Proveedor'}</span>
                    <span className="text-gray-400 text-xs">▼</span>
                  </div>
                  
                  {showProviderDropdown && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowProviderDropdown(false)} />
                      <div className="absolute left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-2 space-y-2">
                        <input
                          type="text"
                          placeholder="Buscar proveedor..."
                          value={providerSearch}
                          onChange={e => setProviderSearch(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          className="w-full border border-gray-200 rounded-md p-1.5 text-xs focus:outline-none focus:border-blue-400"
                          autoFocus
                        />
                        <div className="max-h-40 overflow-y-auto divide-y divide-gray-50">
                          {providers.filter(p => (p.name || '').toLowerCase().includes(providerSearch.toLowerCase())).length === 0 ? (
                            <p className="text-[10px] text-gray-400 text-center py-2">No se encontraron proveedores</p>
                          ) : (
                            providers
                              .filter(p => (p.name || '').toLowerCase().includes(providerSearch.toLowerCase()))
                              .map(p => (
                                <div
                                  key={p.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSupplier(p.name);
                                    setShowProviderDropdown(false);
                                    setProviderSearch('');
                                  }}
                                  className="p-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 font-medium cursor-pointer rounded transition-colors truncate"
                                >
                                  {p.name} {p.ruc ? `(${p.ruc})` : ''}
                                </div>
                              ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nota / Comentario</label>
                <textarea
                  className="w-full border rounded p-2 text-sm"
                  rows="2"
                  placeholder="Escribe aquí el detalle..."
                  value={formData.note}
                  onChange={e => setFormData({ ...formData, note: e.target.value })}
                />
              </div>

              <button
                type="button"
                onClick={handleSaveMovement}
                className="w-full bg-primary text-white font-bold py-2 rounded hover:bg-green-600 flex items-center justify-center gap-2"
              >
                <Save size={18} /> {editingLog ? 'ACTUALIZAR Y CORREGIR STOCK' : 'GUARDAR MOVIMIENTO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TABLA DE HISTORIAL PAGINADA */}
      {(() => {
        const totalHistPages = Math.ceil(logs.length / histPerPage);
        const histStart = (histPage - 1) * histPerPage;
        const histEnd = histStart + histPerPage;
        const currentLogs = logs.slice(histStart, histEnd);

        return (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
          <thead className="bg-emerald-600 text-white font-bold text-xs uppercase sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-2.5 py-3 border-r border-emerald-500/25">Fecha</th>
              <th className="px-2.5 py-3 border-r border-emerald-500/25">Producto / Variante</th>
              <th className="px-2.5 py-3 border-r border-emerald-500/25">Motivo</th>
              <th className="px-2.5 py-3 border-r border-emerald-500/25">Nota</th>
              <th className="px-2.5 py-3 border-r border-emerald-500/25">Usuario</th>
              <th className="px-2.5 py-3 text-right border-r border-emerald-500/25">Ant.</th>
              <th className="px-2.5 py-3 text-right border-r border-emerald-500/25">Cambio</th>
              <th className="px-2.5 py-3 text-right border-r border-emerald-500/25">Final</th>
              <th className="px-2.5 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.length === 0 ? (
              <tr><td colSpan="9" className="p-8 text-center text-gray-400">Sin movimientos registrados</td></tr>
            ) : currentLogs.map((log) => {
              const previousStock = (log.finalStock || 0) - (log.change || 0);
              return (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-2.5 py-3 text-gray-600 whitespace-nowrap text-xs">{formatDate(log.date)}</td>
                  <td className="px-2.5 py-3 font-bold text-gray-800 text-xs">{log.variantName || 'Producto Base'}</td>
                  <td className="px-2.5 py-3 text-xs">
                    <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200">{log.reason}</span>
                  </td>
                  <td className="px-2.5 py-3 text-gray-500 italic text-xs max-w-[120px] truncate">
                    {log.note ? (
                      <div className="flex items-center gap-1" title={log.note}>
                        <MessageSquare size={12} className="text-blue-400 shrink-0" />{log.note}
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-2.5 py-3 text-gray-600 text-xs truncate max-w-[90px]" title={log.user || 'Sistema'}>{log.user || 'Sistema'}</td>
                  <td className="px-2.5 py-3 text-right text-gray-400 text-xs font-mono">{previousStock}</td>
                  <td className="px-2.5 py-3 text-right text-xs">
                    <div className={`font-bold flex items-center justify-end gap-1 ${log.change > 0 ? 'text-green-600' : log.change < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                      {log.change > 0 && <ArrowUp size={12} />}
                      {log.change < 0 && <ArrowDown size={12} />}
                      {log.change === 0 && <Minus size={12} />}
                      {Math.abs(log.change)}
                    </div>
                  </td>
                  <td className="px-2.5 py-3 text-right font-black text-gray-700 text-xs bg-gray-50/50">{log.finalStock}</td>
                  <td className="px-2.5 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(log)}
                        className="text-blue-500 hover:bg-blue-100 p-1.5 rounded transition-colors"
                        title="Editar Completo"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteLog(log.id)}
                        className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors"
                        title="Eliminar Registro"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

            {/* PAGINADOR COMPACTO DEL HISTORIAL */}
            {logs.length > histPerPage && (
              <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-2.5 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-400">
                  <span className="font-semibold text-gray-600">{histStart + 1}</span>–<span className="font-semibold text-gray-600">{Math.min(histEnd, logs.length)}</span> de <span className="font-semibold text-gray-600">{logs.length}</span> registros
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setHistPage(1)} disabled={histPage === 1} className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 bg-white text-gray-400 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    <ChevronsLeft size={13} />
                  </button>
                  <button onClick={() => setHistPage(p => Math.max(p - 1, 1))} disabled={histPage === 1} className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 bg-white text-gray-400 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    <ChevronLeft size={13} />
                  </button>
                  {Array.from({ length: totalHistPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalHistPages || (p >= histPage - 1 && p <= histPage + 1))
                    .reduce((acc, p, idx, arr) => { if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...'); acc.push(p); return acc; }, [])
                    .map((item, idx) =>
                      item === '...' ? (
                        <span key={`he-${idx}`} className="w-7 h-7 flex items-center justify-center text-gray-400 text-xs">…</span>
                      ) : (
                        <button key={item} onClick={() => setHistPage(item)}
                          className={`w-7 h-7 flex items-center justify-center rounded text-xs font-medium border transition-all ${
                            histPage === item ? 'bg-primary text-white border-primary' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}>{item}</button>
                      )
                    )
                  }
                  <button onClick={() => setHistPage(p => Math.min(p + 1, totalHistPages))} disabled={histPage === totalHistPages} className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 bg-white text-gray-400 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    <ChevronRight size={13} />
                  </button>
                  <button onClick={() => setHistPage(totalHistPages)} disabled={histPage === totalHistPages} className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 bg-white text-gray-400 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    <ChevronsRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}