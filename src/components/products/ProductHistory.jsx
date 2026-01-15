import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc, runTransaction, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from '../../firebase/config';
import { History, MessageSquare, PlusCircle, X, Save, ArrowUp, ArrowDown, Minus, Trash2, Edit, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function ProductHistory({ productId, onStockUpdate }) {
  const { userData } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para el Modal
  const [showModal, setShowModal] = useState(false);
  const [productData, setProductData] = useState(null);
  
  // Estado para saber si estamos editando
  const [editingLog, setEditingLog] = useState(null); 

  const [formData, setFormData] = useState({
    variantIndex: -1, 
    type: 'add', 
    quantity: 0,
    reason: 'Compra a Proveedor',
    note: ''
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
        if(productId) {
            const docSnap = await getDoc(doc(db, "products", productId));
            if(docSnap.exists()) setProductData(docSnap.data());
        }
    };
    loadProduct();
  }, [productId]);

  // ELIMINAR REGISTRO (Solo borra el log visual)
  const handleDeleteLog = async (logId) => {
      if (window.confirm("¿Deseas eliminar este registro del historial? (Nota: Esto no modifica el stock actual, solo borra el registro visual)")) {
          try {
              await deleteDoc(doc(db, "inventory_logs", logId));
              fetchHistory();
          } catch (e) { console.error(e); alert("Error al eliminar"); }
      }
  };

  // --- ABRIR MODAL PARA EDITAR ---
  const handleOpenEdit = (log) => {
      // Intentamos adivinar el índice de la variante basándonos en el nombre guardado
      let vIndex = -1;
      if (productData?.variants) {
          // Buscamos si el nombre del log contiene el nombre de alguna variante
          vIndex = productData.variants.findIndex(v => log.variantName.includes(v.name));
      }

      // Determinar el tipo y cantidad basado en el cambio positivo/negativo
      let type = 'add';
      let qty = Math.abs(log.change);

      if (log.change < 0) type = 'subtract';
      // Si fue un ajuste exacto, es difícil saberlo solo con 'change', asumimos add/subtract para corregir.

      setEditingLog(log); // Guardamos el log que se está editando
      setFormData({
          variantIndex: vIndex,
          type: type,
          quantity: qty,
          reason: log.reason,
          note: log.note || ''
      });
      setShowModal(true);
  };

  // --- ABRIR MODAL PARA CREAR ---
  const handleOpenCreate = () => {
      setEditingLog(null); // Limpiamos edición
      setFormData({ 
          variantIndex: -1, 
          type: 'add', 
          quantity: 0, 
          reason: 'Compra a Proveedor', 
          note: '' 
      });
      setShowModal(true);
  }

  // --- GUARDAR MOVIMIENTO (CREAR O EDITAR) ---
  const handleSaveMovement = async () => {
    if(!formData.quantity || formData.quantity < 0) return alert("Ingrese una cantidad válida");

    try {
        await runTransaction(db, async (transaction) => {
            const productRef = doc(db, "products", productId);
            const sfDoc = await transaction.get(productRef);
            if (!sfDoc.exists()) throw "Producto no existe";

            const prod = sfDoc.data();
            let currentStock = 0;
            
            // 1. Determinar Variante Actual
            let variantName = prod.name; 
            let targetVariantIndex = formData.variantIndex;

            if (targetVariantIndex >= 0 && prod.variants) {
                const variant = prod.variants[targetVariantIndex];
                currentStock = parseInt(variant.stock) || 0;
                variantName = `${prod.name} / ${variant.name}`; 
            } else {
                currentStock = parseInt(prod.current_stock) || 0;
            }

            // 2. Lógica Especial para EDICIÓN
            if (editingLog) {
                // A. Primero REVERTIMOS el cambio anterior en el stock
                currentStock = currentStock - editingLog.change; 
            }

            // 3. Calcular NUEVO cambio
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

            // 4. Actualizar Base de Datos (Producto)
            if (targetVariantIndex >= 0 && prod.variants) {
                const newVariants = [...prod.variants];
                newVariants[targetVariantIndex].stock = newStock;
                transaction.update(productRef, { variants: newVariants });
            } else {
                transaction.update(productRef, { current_stock: newStock });
            }

            // 5. Guardar Log (Crear o Actualizar)
            if (editingLog) {
                const logRef = doc(db, "inventory_logs", editingLog.id);
                transaction.update(logRef, {
                    date: new Date(), 
                    variantName: variantName,
                    reason: formData.reason,
                    note: formData.note,
                    user: userData?.name || 'Usuario (Editado)',
                    change: change,
                    finalStock: newStock
                });
            } else {
                const newLogRef = doc(collection(db, "inventory_logs"));
                transaction.set(newLogRef, {
                    productId: productId,
                    date: new Date(),
                    variantName: variantName, 
                    reason: formData.reason,
                    note: formData.note,
                    user: userData?.name || 'Usuario',
                    change: change,
                    finalStock: newStock
                });
            }
        });

        alert(editingLog ? "Registro actualizado y stock corregido." : "Movimiento registrado con éxito.");
        setShowModal(false);
        fetchHistory(); 
        if(onStockUpdate) onStockUpdate(); 

    } catch (error) {
        console.error("Error transacción:", error);
        alert("Error al guardar: " + error);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return new Intl.DateTimeFormat('es-PY', { 
      day: '2-digit', month: '2-digit', year: 'numeric', 
      hour: '2-digit', minute: '2-digit' 
    }).format(date);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden mt-8">
      <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
        <h3 className="font-bold text-gray-700 flex items-center gap-2">
          <History size={18} /> Historial y Notas
        </h3>
        
        <button 
            type="button" 
            onClick={handleOpenCreate}
            className="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-100 font-bold text-gray-700 flex items-center gap-2"
        >
            <PlusCircle size={14}/> AGREGAR NOTA / AJUSTE
        </button>
      </div>
      
      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h4 className="font-bold text-gray-800">
                        {editingLog ? 'Editar Movimiento' : 'Registrar Movimiento'}
                    </h4>
                    <button type="button" onClick={() => setShowModal(false)}><X size={20} className="text-gray-400"/></button>
                </div>
                
                {editingLog && (
                    <div className="mb-4 bg-yellow-50 text-yellow-800 text-xs p-3 rounded flex items-start gap-2">
                        <AlertTriangle size={16} className="shrink-0"/>
                        <p>Atención: Al editar este registro, el stock actual del producto se recalculará automáticamente para reflejar el cambio.</p>
                    </div>
                )}

                <div className="space-y-4">
                    {/* ... (Resto del formulario igual) ... */}
                    {productData?.variants?.length > 0 && (
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Variante Afectada</label>
                            <select 
                                className="w-full border rounded p-2" 
                                value={formData.variantIndex}
                                onChange={e => setFormData({...formData, variantIndex: parseInt(e.target.value)})}
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
                                onChange={e => setFormData({...formData, type: e.target.value})}
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
                                onChange={e => setFormData({...formData, quantity: e.target.value})}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Motivo</label>
                        <select 
                            className="w-full border rounded p-2"
                            value={formData.reason}
                            onChange={e => setFormData({...formData, reason: e.target.value})}
                        >
                            <option>Compra a Proveedor</option>
                            <option>Ajuste de Inventario</option>
                            <option>Pérdida / Daño</option>
                            <option>Devolución</option>
                            <option>Otro</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nota / Comentario</label>
                        <textarea 
                            className="w-full border rounded p-2 text-sm"
                            rows="2"
                            placeholder="Escribe aquí el detalle..."
                            value={formData.note}
                            onChange={e => setFormData({...formData, note: e.target.value})}
                        ></textarea>
                    </div>

                    <button 
                        type="button" 
                        onClick={handleSaveMovement}
                        className="w-full bg-primary text-white font-bold py-2 rounded hover:bg-green-600 flex items-center justify-center gap-2"
                    >
                        <Save size={18}/> {editingLog ? 'ACTUALIZAR Y CORREGIR STOCK' : 'GUARDAR MOVIMIENTO'}
                    </button>
                </div>
            </div>
        </div>
      )}

      <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-white text-gray-500 font-bold border-b text-xs uppercase sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-6 py-3 bg-gray-50">Fecha</th>
              <th className="px-6 py-3 bg-gray-50">Producto / Variante</th>
              <th className="px-6 py-3 bg-gray-50">Motivo</th>
              <th className="px-6 py-3 bg-gray-50">Nota</th>
              <th className="px-6 py-3 bg-gray-50">Usuario</th>
              <th className="px-6 py-3 text-right bg-gray-50">Ant.</th>
              <th className="px-6 py-3 text-right bg-gray-50">Cambio</th>
              <th className="px-6 py-3 text-right bg-gray-50">Final</th>
              <th className="px-6 py-3 text-center bg-gray-50">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.length === 0 ? (
                <tr><td colSpan="9" className="p-8 text-center text-gray-400">Sin movimientos registrados</td></tr>
            ) : logs.map((log) => {
              const previousStock = (log.finalStock || 0) - (log.change || 0);
              
              return (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-600 whitespace-nowrap text-xs">{formatDate(log.date)}</td>
                    <td className="px-6 py-4 font-bold text-gray-800 text-xs">{log.variantName || 'Producto Base'}</td>
                    <td className="px-6 py-4 text-xs"><span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200">{log.reason}</span></td>
                    <td className="px-6 py-4 text-gray-500 italic text-xs max-w-[150px] truncate">{log.note ? (<div className="flex items-center gap-1" title={log.note}><MessageSquare size={12} className="text-blue-400 shrink-0"/>{log.note}</div>) : '-'}</td>
                    <td className="px-6 py-4 text-gray-600 text-xs">{log.user || 'Sistema'}</td>
                    <td className="px-6 py-4 text-right text-gray-400 text-xs font-mono">{previousStock}</td>
                    <td className="px-6 py-4 text-right text-xs">
                        <div className={`font-bold flex items-center justify-end gap-1 ${log.change > 0 ? 'text-green-600' : log.change < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                            {log.change > 0 && <ArrowUp size={12}/>}
                            {log.change < 0 && <ArrowDown size={12}/>}
                            {log.change === 0 && <Minus size={12}/>}
                            {Math.abs(log.change)}
                        </div>
                    </td>
                    <td className="px-6 py-4 text-right font-black text-gray-700 text-xs bg-gray-50/50">{log.finalStock}</td>

                    {/* COLUMNA DE ACCIONES */}
                    <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                            <button 
                                type="button"  // <--- CORRECCIÓN CLAVE
                                onClick={() => handleOpenEdit(log)} 
                                className="text-blue-500 hover:bg-blue-100 p-1.5 rounded transition-colors" 
                                title="Editar Completo"
                            >
                                <Edit size={14}/>
                            </button>
                            <button 
                                type="button" // <--- CORRECCIÓN CLAVE
                                onClick={() => handleDeleteLog(log.id)} 
                                className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors" 
                                title="Eliminar Registro"
                            >
                                <Trash2 size={14}/>
                            </button>
                        </div>
                    </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}