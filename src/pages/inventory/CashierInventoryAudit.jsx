import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { collection, getDocs, doc, setDoc, addDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { 
  ClipboardCheck, Loader2, Save, Send, History, Check, X, 
  AlertTriangle, Eye, ArrowLeft, Info, Calendar, User, FileText,
  FileSpreadsheet, Search
} from 'lucide-react';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { sileo } from 'sileo';
import * as XLSX from 'xlsx';

// --- UTILIDADES LOCALES DE FORMATO DE FECHA/HORA ---
const formatDatePY = (date) => {
  if (!date) return '-';
  const d = date?.toDate ? date.toDate() : new Date(date);
  return new Intl.DateTimeFormat('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Asuncion'
  }).format(d);
};

const formatTime24 = (date) => {
  if (!date) return '-';
  const d = date?.toDate ? date.toDate() : new Date(date);
  return new Intl.DateTimeFormat('es-PY', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Asuncion'
  }).format(d);
};

export default function CashierInventoryAudit() {
  const { userData } = useAuth();
  const isAdmin = userData?.role === 'admin';

  // --- ESTADOS ---
  const [products, setProducts] = useState([]);
  const [draftItems, setDraftItems] = useState({});
  const [draftMetadata, setDraftMetadata] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Navegación Admin (TABS)
  const [activeTab, setActiveTab] = useState('curso'); // 'curso' | 'historial'
  
  // Modal detalle de historial
  const [selectedReport, setSelectedReport] = useState(null);

  // --- CARGAR DATOS ---
  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Cargar productos activos
      const prodSnap = await getDocs(collection(db, "products"));
      const prodList = prodSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProducts(prodList);

      // 2. Cargar borrador activo
      const draftDoc = await getDoc(doc(db, "cashier_inventory_drafts", "active"));
      if (draftDoc.exists()) {
        const data = draftDoc.data();
        setDraftItems(data.items || {});
        setDraftMetadata({
          updatedBy: data.updatedBy,
          updatedAt: data.updatedAt
        });
      } else {
        setDraftItems({});
        setDraftMetadata(null);
      }

      // 3. Cargar historial de reportes (si es admin)
      if (isAdmin) {
        const histSnap = await getDocs(collection(db, "cashier_inventory_history"));
        const histList = histSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          dateObj: doc.data().submittedAt?.toDate ? doc.data().submittedAt.toDate() : new Date(doc.data().submittedAt)
        }));
        // Ordenar descendente por fecha
        histList.sort((a, b) => b.dateObj - a.dateObj);
        setHistory(histList);
      }

    } catch (error) {
      console.error("Error al cargar la auditoría:", error);
      sileo.error({ title: "Error al cargar los datos del inventario." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [isAdmin]);

  // --- GENERAR ITEMS A AUDITAR ---
  const getAuditItems = () => {
    const items = [];
    products.forEach(p => {
      if (p.variants && p.variants.length > 0) {
        p.variants.forEach(v => {
          items.push({
            id: `${p.id}_${v.id}`,
            productId: p.id,
            variantId: v.id,
            name: `${p.name} (${v.name})`,
            systemStock: parseInt(v.stock) || 0
          });
        });
      } else {
        items.push({
          id: p.id,
          productId: p.id,
          variantId: null,
          name: p.name,
          systemStock: parseInt(p.current_stock) || 0
        });
      }
    });
    // Ordenar alfabéticamente por nombre
    items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  };

  const auditItems = getAuditItems();
  const filteredAuditItems = auditItems.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // --- CONTADORES DE PROGRESO ---
  const getProgressStats = () => {
    if (auditItems.length === 0) return { verifiedCount: 0, totalCount: 0, percent: 0 };
    
    const verifiedCount = auditItems.filter(item => {
      const draft = draftItems[item.id];
      const hasStock = draft?.physicalStock !== undefined && draft?.physicalStock !== '';
      const hasMatch = draft?.matchStatus === 'coincide' || draft?.matchStatus === 'no_coincide';
      return hasStock && hasMatch;
    }).length;

    const totalCount = auditItems.length;
    const percent = Math.round((verifiedCount / totalCount) * 100);

    return { verifiedCount, totalCount, percent };
  };

  const stats = getProgressStats();

  // --- ACCIONES EN FORMULARIO (CAJERO) ---
  const handlePhysicalStockChange = (itemId, val) => {
    const cleanVal = val.replace(/\D/g, ''); // Solo números enteros
    setDraftItems(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        physicalStock: cleanVal
      }
    }));
  };

  const handleMatchStatusChange = (itemId, status) => {
    setDraftItems(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        // Toggle si hacen clic en el ya seleccionado
        matchStatus: prev[itemId]?.matchStatus === status ? null : status
      }
    }));
  };

  const handleCommentChange = (itemId, val) => {
    setDraftItems(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        comment: val
      }
    }));
  };

  // --- GUARDAR AVANCE / DRAFT ---
  const handleSaveDraft = async () => {
    setFormLoading(true);
    try {
      await setDoc(doc(db, "cashier_inventory_drafts", "active"), {
        items: draftItems,
        updatedAt: new Date(),
        updatedBy: userData?.name || 'Cajero'
      });
      sileo.success({ title: "Avance guardado con éxito." });
      setDraftMetadata({
        updatedBy: userData?.name || 'Cajero',
        updatedAt: new Date()
      });
    } catch (error) {
      console.error("Error al guardar borrador:", error);
      sileo.error({ title: "No se pudo guardar el progreso." });
    } finally {
      setFormLoading(false);
    }
  };

  // --- CONFIRMAR PRESENTACION INFORME ---
  const handleConfirmReport = () => {
    if (stats.verifiedCount < stats.totalCount) {
      return sileo.warning({ title: "Debes completar el 100% de la auditoría para enviar." });
    }

    setConfirmModal({
      title: '¿Confirmar e informar cruzamiento de inventario?',
      description: 'El informe completo se presentará al administrador y los campos se vaciarán para la próxima semana.',
      confirmText: 'Enviar Informe',
      variant: 'success',
      onConfirm: async () => {
        setFormLoading(true);
        try {
          // 1. Preparar lista estructurada para guardar en el historial
          const itemsToSave = auditItems.map(item => {
            const draft = draftItems[item.id];
            return {
              id: item.id,
              productId: item.productId,
              variantId: item.variantId,
              name: item.name,
              systemStock: item.systemStock,
              physicalStock: parseInt(draft.physicalStock, 10) || 0,
              matchStatus: draft.matchStatus,
              comment: draft.comment || ''
            };
          });

          // 2. Guardar en el historial
          await addDoc(collection(db, "cashier_inventory_history"), {
            submittedAt: new Date(),
            submittedBy: userData?.name || 'Cajero',
            items: itemsToSave,
            totalItems: itemsToSave.length,
            mismatches: itemsToSave.filter(e => e.matchStatus === 'no_coincide').length
          });

          // 3. Eliminar borrador activo de la base de datos
          await deleteDoc(doc(db, "cashier_inventory_drafts", "active"));

          sileo.success({ title: "Cruzamiento de inventario presentado con éxito." });
          setDraftItems({});
          setDraftMetadata(null);
          loadData();
        } catch (error) {
          console.error("Error al enviar informe:", error);
          sileo.error({ title: "No se pudo enviar el reporte." });
        } finally {
          setFormLoading(false);
        }
      }
    });
  };

  // --- EXPORTAR INFORME INDIVIDUAL A EXCEL ---
  const handleExportReportExcel = () => {
    if (!selectedReport) return;
    
    try {
      const dataToExport = selectedReport.items.map(item => ({
        'Producto': item.name,
        'Stock Sistema': item.systemStock,
        'Stock Físico': item.physicalStock,
        'Confirmación': item.matchStatus === 'coincide' ? 'Coincide' : 'No Coincide',
        'Comentarios': item.comment || ''
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      
      // Auto-fit columns
      const max_len = dataToExport.reduce((acc, row) => {
        return {
          'Producto': Math.max(acc['Producto'], String(row['Producto'] || '').length),
          'Stock Sistema': 15,
          'Stock Físico': 15,
          'Confirmación': 15,
          'Comentarios': Math.max(acc['Comentarios'], String(row['Comentarios'] || '').length)
        };
      }, { 'Producto': 10, 'Stock Sistema': 10, 'Stock Físico': 10, 'Confirmación': 12, 'Comentarios': 10 });
      
      ws['!cols'] = [
        { wch: max_len['Producto'] + 2 },
        { wch: max_len['Stock Sistema'] },
        { wch: max_len['Stock Físico'] },
        { wch: max_len['Confirmación'] },
        { wch: max_len['Comentarios'] + 4 }
      ];

      const wb = XLSX.utils.book_new();
      const dateStr = formatDatePY(selectedReport.dateObj).replace(/\//g, '-');
      const timeStr = formatTime24(selectedReport.dateObj).replace(/:/g, '');
      const sheetName = `Audit_${selectedReport.submittedBy}_${dateStr}`.substring(0, 31);
      
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `Inventario_Cajero_${selectedReport.submittedBy}_${dateStr}_${timeStr}.xlsx`);
      sileo.success({ title: "Excel exportado correctamente." });
    } catch (error) {
      console.error("Error al exportar a Excel:", error);
      sileo.error({ title: "No se pudo exportar el informe a Excel." });
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-20 pt-4 px-2">
      
      {/* Modal de confirmación */}
      {confirmModal && (
        <ConfirmModal {...confirmModal} onClose={() => setConfirmModal(null)} />
      )}

      {/* HEADER DE MÓDULO */}
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          <ClipboardCheck className="text-emerald-500 animate-bounce-slow" size={32} /> Cruzamiento de Inventario
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Validación semanal cruzando el stock registrado en el sistema con las existencias físicas del local.
        </p>
      </div>

      {/* --- PANEL DE VISTA PARA ADMINS (CON TABS) --- */}
      {isAdmin && (
        <div className="flex border-b border-slate-200 mb-6 gap-2">
          <button
            onClick={() => setActiveTab('curso')}
            className={`px-4 py-2.5 font-bold text-sm transition-all border-b-2 cursor-pointer ${
              activeTab === 'curso' 
                ? 'border-emerald-600 text-emerald-600' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Auditoría en Curso
          </button>
          <button
            onClick={() => setActiveTab('historial')}
            className={`px-4 py-2.5 font-bold text-sm transition-all border-b-2 cursor-pointer ${
              activeTab === 'historial' 
                ? 'border-emerald-600 text-emerald-600' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Historial de Presentaciones
          </button>
        </div>
      )}

      {/* --- CONTENIDO SEGÚN ROL & TABS --- */}
      
      {/* 1. SECCIÓN PRINCIPAL: AUDITORÍA EN CURSO (Visible para Cajeros siempre y para Admin si está en la pestaña "curso") */}
      {(!isAdmin || activeTab === 'curso') && (
        <div className="space-y-6">
          
          {/* BARRA DE AVANCE & ACCIONES */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="font-extrabold text-slate-800 text-base">Progreso de la Verificación</h2>
                {draftMetadata && (
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    Último avance guardado por <span className="font-bold text-slate-600">{draftMetadata.updatedBy}</span> a las {formatTime24(draftMetadata.updatedAt)} ({formatDatePY(draftMetadata.updatedAt)}).
                  </p>
                )}
              </div>
              
              {/* ACCIONES (Ocultar botones de guardado si es administrador leyendo) */}
              {!isAdmin ? (
                <div className="flex gap-3 w-full md:w-auto">
                  <button
                    onClick={handleSaveDraft}
                    disabled={formLoading || loading}
                    className="flex-1 md:flex-initial flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-600 px-4 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <Save size={16} /> Guardar Progreso
                  </button>
                  <button
                    onClick={handleConfirmReport}
                    disabled={formLoading || loading || stats.verifiedCount < stats.totalCount}
                    className="flex-1 md:flex-initial flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Send size={16} /> Confirmar Informe
                  </button>
                </div>
              ) : (
                <div className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-xs flex gap-2 font-medium">
                  <Info size={16} className="text-slate-400 shrink-0 mt-0.5"/>
                  <p>Estás viendo el avance actual del cajero en tiempo real. **Vista de solo lectura**.</p>
                </div>
              )}
            </div>

            {/* PROGRESS BAR */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold text-slate-500">
                <span>{stats.verifiedCount} de {stats.totalCount} productos controlados</span>
                <span className={stats.percent === 100 ? "text-emerald-600" : "text-emerald-500"}>{stats.percent}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${stats.percent}%` }}
                ></div>
              </div>
            </div>

            {/* Aviso de bloqueo */}
            {!isAdmin && stats.verifiedCount < stats.totalCount && (
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-amber-700 text-xs flex gap-2 font-medium leading-relaxed">
                <AlertTriangle size={16} className="shrink-0 text-amber-600 mt-0.5"/>
                <p>El botón **"Confirmar Informe"** se habilitará únicamente cuando se complete la verificación física y de coincidencia para todos los productos en el local.</p>
              </div>
            )}

          </div>

          {/* TABLA DE AUDITORÍA */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            {/* Buscador de productos */}
            {!loading && auditItems.length > 0 && (
              <div className="p-4 border-b border-slate-150 bg-slate-50/50">
                <div className="relative max-w-md">
                  <Search className="absolute left-3.5 top-3 text-slate-400" size={18} />
                  <input
                    type="text"
                    placeholder="Buscar producto por nombre..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-11 pr-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-emerald-500 bg-white text-slate-800 placeholder-slate-400 transition-colors shadow-2xs"
                  />
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <Loader2 className="animate-spin text-emerald-500" size={40}/>
                <p className="text-sm text-slate-400 font-medium">Cargando inventario...</p>
              </div>
            ) : auditItems.length === 0 ? (
              <div className="p-16 text-center text-slate-400">
                <Info size={40} className="mx-auto mb-2 opacity-20"/>
                <p className="font-semibold text-sm">No hay productos ni variantes cargados en el inventario.</p>
              </div>
            ) : (
              <>
                {/* Tabla para todos los tamaños de pantalla con scroll horizontal */}
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead className="bg-slate-900 border-b border-slate-800 text-xs font-bold text-slate-200 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4">Nombre Producto</th>
                        <th className="px-6 py-4 text-center">STOCK (Sistema)</th>
                        <th className="px-6 py-4 text-center">Stock Físico</th>
                        <th className="px-6 py-4 text-center">Confirmación</th>
                        <th className="px-6 py-4">Comentarios</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {filteredAuditItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-16 text-center text-slate-400 font-medium">
                            <Info size={40} className="mx-auto mb-2 opacity-20"/>
                            <p className="text-sm">No se encontraron productos coincidentes con tu búsqueda.</p>
                          </td>
                        </tr>
                      ) : (
                        filteredAuditItems.map((item) => {
                          const draft = draftItems[item.id] || {};
                          const isCoincide = draft.matchStatus === 'coincide';
                          const isNoCoincide = draft.matchStatus === 'no_coincide';

                          return (
                            <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                              
                              {/* NOMBRE PRODUCTO */}
                              <td className="px-6 py-4 font-bold text-slate-800">
                                {item.name}
                              </td>
                              
                              {/* STOCK SISTEMA */}
                              <td className="px-6 py-4 text-center font-black text-slate-700 text-base">
                                {item.systemStock}
                              </td>
                              
                              {/* STOCK FISICO */}
                              <td className="px-6 py-4 text-center min-w-[120px]">
                                <input 
                                  type="text"
                                  disabled={isAdmin || formLoading}
                                  placeholder="Físico"
                                  value={draft.physicalStock ?? ''}
                                  onChange={(e) => handlePhysicalStockChange(item.id, e.target.value)}
                                  className="w-20 text-center p-2 border border-slate-200 rounded-lg text-sm font-bold focus:outline-none focus:border-emerald-500 bg-slate-50 focus:bg-white text-slate-800 disabled:opacity-75 disabled:bg-slate-100"
                                />
                              </td>
                              
                              {/* CONFIRMACIÓN (SI / NO COINCIDE) */}
                              <td className="px-6 py-4 text-center min-w-[240px]">
                                <div className="flex items-center justify-center gap-2">
                                  
                                  {/* Pill Coincide */}
                                  <button
                                    type="button"
                                    disabled={isAdmin || formLoading}
                                    onClick={() => handleMatchStatusChange(item.id, 'coincide')}
                                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 disabled:opacity-75 ${
                                      isCoincide 
                                        ? 'bg-emerald-500 border-emerald-600 text-white shadow-xs' 
                                        : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-350 hover:text-slate-600'
                                    }`}
                                  >
                                    <Check size={14} /> Coincide
                                  </button>
                                  
                                  {/* Pill No Coincide */}
                                  <button
                                    type="button"
                                    disabled={isAdmin || formLoading}
                                    onClick={() => handleMatchStatusChange(item.id, 'no_coincide')}
                                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 disabled:opacity-75 ${
                                      isNoCoincide 
                                        ? 'bg-red-500 border-red-600 text-white shadow-xs' 
                                        : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-350 hover:text-slate-600'
                                    }`}
                                  >
                                    <X size={14} /> No Coincide
                                  </button>

                                </div>
                              </td>
                              
                              {/* COMENTARIOS */}
                              <td className="px-6 py-4">
                                <input 
                                  type="text"
                                  disabled={isAdmin || formLoading}
                                  placeholder="Observación opcional..."
                                  value={draft.comment ?? ''}
                                  onChange={(e) => handleCommentChange(item.id, e.target.value)}
                                  className="w-full min-w-[180px] p-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-emerald-500 bg-slate-50 focus:bg-white text-slate-800 disabled:opacity-75 disabled:bg-slate-100"
                                />
                              </td>

                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

        </div>
      )}

      {/* 2. SECCIÓN PRINCIPAL: HISTORIAL DE PRESENTACIONES (Solo visible para Admin si está en pestaña "historial") */}
      {isAdmin && activeTab === 'historial' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm min-h-[300px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <Loader2 className="animate-spin text-emerald-500" size={40}/>
                <p className="text-sm text-slate-400 font-medium">Cargando historial...</p>
              </div>
            ) : history.length === 0 ? (
              <div className="p-16 text-center text-slate-400">
                <History size={40} className="mx-auto mb-2 opacity-20"/>
                <p className="font-semibold text-sm">Aún no se han presentado informes de inventario.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-900 border-b border-slate-800 text-xs font-bold text-slate-200 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Fecha &amp; Hora</th>
                      <th className="px-6 py-4">Presentado Por</th>
                      <th className="px-6 py-4 text-center">Total Productos</th>
                      <th className="px-6 py-4 text-center">Diferencias</th>
                      <th className="px-6 py-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {history.map((report) => (
                      <tr key={report.id} className="hover:bg-slate-50/50 transition-colors">
                        
                        {/* FECHA Y HORA */}
                        <td className="px-6 py-4 text-slate-600 font-medium whitespace-nowrap">
                          {formatDatePY(report.dateObj)}
                          <span className="text-xs text-slate-400 ml-2 font-bold bg-slate-100 px-2 py-0.5 rounded-md">
                            {formatTime24(report.dateObj)}
                          </span>
                        </td>
                        
                        {/* CAJERO */}
                        <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-2">
                          <div className="w-6.5 h-6.5 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shadow-xs">
                            <User size={12}/>
                          </div>
                          {report.submittedBy}
                        </td>
                        
                        {/* TOTAL PRODUCTOS */}
                        <td className="px-6 py-4 text-center font-bold text-slate-700">
                          {report.totalItems}
                        </td>
                        
                        {/* DIFERENCIAS / MISMATCHES */}
                        <td className="px-6 py-4 text-center whitespace-nowrap font-black">
                          {report.mismatches > 0 ? (
                            <span className="text-[10px] bg-red-100 text-red-700 px-2.5 py-1 rounded-full border border-red-200 font-bold uppercase tracking-wide flex items-center gap-1.5 w-fit mx-auto">
                              <AlertTriangle size={10} /> {report.mismatches} Diferencias
                            </span>
                          ) : (
                            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200 font-bold uppercase tracking-wide flex items-center gap-1 w-fit mx-auto">
                              <Check size={10} /> Todo Coincide
                            </span>
                          )}
                        </td>
                        
                        {/* ACCIONES */}
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => setSelectedReport(report)}
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 border border-emerald-200 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <Eye size={14}/> Ver Detalle
                          </button>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL DETALLE DE HISTORIAL (REPORT VIEW) --- */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fadeIn">
          <div 
            className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col"
            style={{ maxHeight: '85vh' }}
          >
            
            {/* Header Modal */}
            <div className="px-6 py-4 bg-slate-900 flex justify-between items-center text-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <FileText size={20} className="text-emerald-400" />
                <div>
                  <h2 className="text-lg font-black tracking-tight">Reporte Presentado</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                    Por: {selectedReport.submittedBy} &mdash; {formatDatePY(selectedReport.dateObj)} a las {formatTime24(selectedReport.dateObj)}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedReport(null)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Cuerpo Tabla */}
            <div className="overflow-y-auto p-6 flex-1">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="px-5 py-3">Nombre Producto</th>
                      <th className="px-5 py-3 text-center">STOCK (Sistema)</th>
                      <th className="px-5 py-3 text-center">Stock Físico</th>
                      <th className="px-5 py-3 text-center">Confirmación</th>
                      <th className="px-5 py-3">Comentarios</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {selectedReport.items.map((item) => {
                      const isCoincide = item.matchStatus === 'coincide';
                      return (
                        <tr key={item.id} className={`hover:bg-slate-50/50 transition-colors ${!isCoincide ? 'bg-red-50/10' : ''}`}>
                          <td className="px-5 py-3.5 font-bold text-slate-800">{item.name}</td>
                          <td className="px-5 py-3.5 text-center font-semibold text-slate-600">{item.systemStock}</td>
                          <td className="px-5 py-3.5 text-center font-bold text-slate-850">{item.physicalStock}</td>
                          <td className="px-5 py-3.5 text-center">
                            {isCoincide ? (
                              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-200 font-bold uppercase tracking-wide inline-flex items-center gap-1">
                                <Check size={10} /> Coincide
                              </span>
                            ) : (
                              <span className="text-[10px] bg-red-50 text-red-700 px-2 py-0.5 rounded-md border border-red-200 font-bold uppercase tracking-wide inline-flex items-center gap-1">
                                <X size={10} /> No Coincide
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-slate-500 italic text-xs max-w-[200px] truncate" title={item.comment}>
                            {item.comment || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer Modal */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={handleExportReportExcel}
                className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm transition-all cursor-pointer flex items-center gap-2"
              >
                <FileSpreadsheet size={16} /> Exportar Excel
              </button>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-sm transition-all cursor-pointer"
              >
                Cerrar Reporte
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
