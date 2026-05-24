import { sileo } from 'sileo';
import React, { useState, useEffect } from 'react';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Truck, Search, Plus, Trash2, Edit, Save, X, Mail, Phone, MapPin, ClipboardList, Tag, Calendar, Info, Clock, User, DollarSign } from 'lucide-react';
import { formatDateTime } from '../../utils/dateUtils';

export default function ProvidersList() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal Estado
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [confirmModal, setConfirmModal] = useState(null);
  const [formData, setFormData] = useState({ name: '', ruc: '', phone: '', address: '', email: '' });

  // Historial del Proveedor
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEntries, setHistoryEntries] = useState([]); // stock_entries
  const [historyLogs, setHistoryLogs] = useState([]); // inventory_logs
  const [activeTab, setActiveTab] = useState('purchases'); // 'purchases' | 'returns'
  const [expandedEntryId, setExpandedEntryId] = useState(null);

  const handleOpenHistory = async (provider) => {
    setSelectedProvider(provider);
    setShowHistoryModal(true);
    setHistoryLoading(true);
    setActiveTab('purchases');
    setHistoryEntries([]);
    setHistoryLogs([]);
    setExpandedEntryId(null);

    try {
      // Query stock_entries
      const entriesQuery = query(
        collection(db, "stock_entries"),
        where("supplier", "==", provider.name)
      );
      const entriesSnap = await getDocs(entriesQuery);
      const entriesData = entriesSnap.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          ...d,
          dateObj: d.date?.toDate ? d.date.toDate() : new Date(d.date)
        };
      }).sort((a, b) => b.dateObj - a.dateObj);
      setHistoryEntries(entriesData);

      // Query inventory_logs usando supplierName (que es el campo unificado)
      const logsQuery = query(
        collection(db, "inventory_logs"),
        where("supplierName", "==", provider.name)
      );
      const logsSnap = await getDocs(logsQuery);
      const logsData = logsSnap.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          ...d,
          dateObj: d.date?.toDate ? d.date.toDate() : new Date(d.date)
        };
      }).sort((a, b) => b.dateObj - a.dateObj);
      setHistoryLogs(logsData);

    } catch (error) {
      console.error("Error cargando historial de proveedor:", error);
      sileo.error({ title: "Error al cargar el historial del proveedor." });
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleEntryExpand = (id) => {
    setExpandedEntryId(prev => prev === id ? null : id);
  };

  // Cargar Proveedores
  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    try {
        const snap = await getDocs(collection(db, "providers"));
        setProviders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
        console.error("Error cargando proveedores:", error);
        sileo.error({ title: "Error al cargar los proveedores." });
    } finally {
        setLoading(false);
    }
  };

  // Guardar (Crear o Editar)
  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      return sileo.warning({ title: "El nombre es obligatorio." });
    }
    try {
      if (editingId) {
        await updateDoc(doc(db, "providers", editingId), formData);
        sileo.success({ title: "Proveedor actualizado con éxito." });
      } else {
        await addDoc(collection(db, "providers"), {
          ...formData,
          createdAt: new Date()
        });
        sileo.success({ title: "Proveedor registrado con éxito." });
      }
      setShowModal(false);
      setEditingId(null);
      setFormData({ name: '', ruc: '', phone: '', address: '', email: '' }); // Reseteamos
      fetchProviders();
    } catch (error) {
      console.error(error);
      sileo.error({ title: "Error al guardar proveedor" });
    }
  };

  const handleEdit = (provider) => {
    setFormData({
      name: provider.name || '',
      ruc: provider.ruc || '',
      phone: provider.phone || '',
      address: provider.address || '',
      email: provider.email || ''
    });
    setEditingId(provider.id);
    setShowModal(true);
  };

  const handleDelete = (id, name) => {
    setConfirmModal({
      title: '¿Eliminar este proveedor?',
      description: `El proveedor "${name}" será eliminado del directorio de compras y abastecimiento.`,
      confirmText: 'Sí, eliminar',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "providers", id));
          fetchProviders();
          sileo.success({ title: 'Proveedor eliminado.' });
        } catch (e) {
          console.error(e);
          sileo.error({ title: 'Error al eliminar proveedor.' });
        }
      },
    });
  };

  // Filtrado
  const filteredProviders = providers.filter(p => 
    (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (p.ruc || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto pb-20">
      {/* Modal de confirmación */}
      {confirmModal && (
        <ConfirmModal {...confirmModal} onClose={() => setConfirmModal(null)} />
      )}

      <div className="flex justify-between items-center mb-6">
        <div>
           <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
             <Truck className="text-blue-600" size={26}/>
             Directorio de Proveedores
           </h1>
           <p className="text-gray-500 text-sm">Gestiona la base de datos para compras y entradas de stock.</p>
        </div>
        <button 
          onClick={() => { 
            setEditingId(null); 
            setFormData({ name: '', ruc: '', phone: '', address: '', email: '' }); 
            setShowModal(true); 
          }} 
          className="bg-primary text-white px-4 py-2.5 rounded-lg font-bold flex items-center gap-2 shadow-sm hover:bg-green-700 transition-colors"
        >
          <Plus size={20} /> Nuevo Proveedor
        </button>
      </div>

      {/* Buscador */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex gap-4">
        <div className="relative flex-1">
           <Search className="absolute left-3 top-2.5 text-gray-400" size={20}/>
           <input 
             type="text" 
             placeholder="Buscar por Razón Social o RUC..." 
             value={searchTerm} 
             onChange={e => setSearchTerm(e.target.value)} 
             className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-primary text-sm"
           />
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center items-center h-48">
          <p className="text-gray-500 text-sm animate-pulse">Cargando proveedores...</p>
        </div>
      ) : filteredProviders.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <Truck size={40} className="mx-auto mb-2 opacity-25 text-blue-500"/>
          <p className="font-medium text-sm">No se encontraron proveedores registrados.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
           {filteredProviders.map(provider => (
               <div 
                 key={provider.id} 
                 onClick={() => handleOpenHistory(provider)}
                 className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 relative group cursor-pointer hover:border-blue-300"
               >
                   <div className="flex items-start justify-between">
                      <div>
                          <h3 className="font-bold text-gray-800 line-clamp-1">{provider.name}</h3>
                          <p className="text-xs text-gray-500 font-mono mt-1">RUC: {provider.ruc || 'Sin RUC'}</p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                          <Truck size={16}/>
                      </div>
                   </div>
                   
                   {/* DATOS DE CONTACTO */}
                   <div className="mt-4 pt-4 border-t border-gray-50 text-xs text-gray-500 space-y-2">
                      <div className="flex items-center gap-2">
                          <MapPin size={14} className="text-gray-400 shrink-0"/> 
                          <span className="truncate">{provider.address || 'Sin dirección'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                          <Phone size={14} className="text-gray-400 shrink-0"/> 
                          <span>{provider.phone || 'Sin teléfono'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                          <Mail size={14} className="text-gray-400 shrink-0"/> 
                          <span className="truncate">{provider.email || 'Sin correo'}</span>
                      </div>
                   </div>
                   
                   <div className="absolute top-4 right-12 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 bg-white pl-2">
                       <button 
                         onClick={(e) => { e.stopPropagation(); handleEdit(provider); }} 
                         className="text-blue-500 hover:bg-blue-50 p-1 rounded" 
                         title="Editar"
                       >
                         <Edit size={16}/>
                       </button>
                       <button 
                         onClick={(e) => { e.stopPropagation(); handleDelete(provider.id, provider.name); }} 
                         className="text-red-500 hover:bg-red-50 p-1 rounded" 
                         title="Eliminar"
                       >
                         <Trash2 size={16}/>
                       </button>
                   </div>
               </div>
           ))}
        </div>
      )}

      {/* MODAL EDITAR/NUEVO */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="font-bold text-lg text-gray-800">{editingId ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h3>
                    <button onClick={() => setShowModal(false)}><X size={20} className="text-gray-400"/></button>
                </div>
                <form onSubmit={handleSave} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">Razón Social / Nombre *</label>
                        <input 
                          type="text" 
                          required 
                          placeholder="Ej: Distribuidora López S.A."
                          value={formData.name} 
                          onChange={e => setFormData({...formData, name: e.target.value})} 
                          className="w-full border rounded-lg p-2.5 mt-1 focus:border-primary outline-none text-sm border-gray-200"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">RUC</label>
                        <input 
                          type="text" 
                          placeholder="Ej: 80012345-6"
                          value={formData.ruc} 
                          onChange={e => setFormData({...formData, ruc: e.target.value})} 
                          className="w-full border rounded-lg p-2.5 mt-1 focus:border-primary outline-none text-sm border-gray-200"
                        />
                    </div>
                    
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">Correo Electrónico</label>
                        <input 
                          type="email" 
                          value={formData.email} 
                          onChange={e => setFormData({...formData, email: e.target.value})} 
                          className="w-full border rounded-lg p-2.5 mt-1 focus:border-primary outline-none text-sm border-gray-200" 
                          placeholder="proveedor@ejemplo.com"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase">Teléfono</label>
                            <input 
                              type="text" 
                              placeholder="Ej: 0981 123456"
                              value={formData.phone} 
                              onChange={e => setFormData({...formData, phone: e.target.value})} 
                              className="w-full border rounded-lg p-2.5 mt-1 focus:border-primary outline-none text-sm border-gray-200"
                            />
                        </div>
                         <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase">Dirección</label>
                            <input 
                              type="text" 
                              placeholder="Ej: Mcal. Estigarribia 450"
                              value={formData.address} 
                              onChange={e => setFormData({...formData, address: e.target.value})} 
                              className="w-full border rounded-lg p-2.5 mt-1 focus:border-primary outline-none text-sm border-gray-200"
                            />
                        </div>
                    </div>
                    <button type="submit" className="w-full bg-primary text-white font-bold py-3 rounded-lg hover:bg-green-700 flex justify-center gap-2 mt-2 shadow-sm transition-colors text-sm">
                        <Save size={18}/> GUARDAR DATOS
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* MODAL HISTORIAL DE TRANSACCIONES */}
      {showHistoryModal && selectedProvider && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden border border-gray-100 max-h-[90vh]">
            
            {/* Cabecera del modal */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50/30 p-6 border-b border-gray-100 flex justify-between items-start">
              <div>
                <span className="text-[10px] bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider mb-2 inline-block">
                  Ficha de Proveedor
                </span>
                <h3 className="font-extrabold text-xl text-gray-800 flex items-center gap-2">
                  <Truck size={22} className="text-blue-600" />
                  {selectedProvider.name}
                </h3>
                <p className="text-xs text-gray-500 font-mono mt-1">RUC: {selectedProvider.ruc || 'Sin RUC'}</p>
              </div>
              <button 
                onClick={() => setShowHistoryModal(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={22} />
              </button>
            </div>

            {/* Datos de contacto rápidos */}
            <div className="px-6 py-3 bg-gray-50/50 border-b border-gray-100 flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-500">
              {selectedProvider.phone && <span>📞 {selectedProvider.phone}</span>}
              {selectedProvider.email && <span className="truncate">✉ {selectedProvider.email}</span>}
              {selectedProvider.address && <span className="truncate">📍 {selectedProvider.address}</span>}
            </div>

            {/* Pestañas (Tabs) */}
            <div className="flex border-b border-gray-100 bg-white">
              <button
                onClick={() => setActiveTab('purchases')}
                className={`flex-1 py-3.5 text-center font-bold text-sm border-b-2 transition-all flex items-center justify-center gap-2
                  ${activeTab === 'purchases'
                    ? 'border-blue-600 text-blue-600 bg-blue-50/10'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
              >
                <ClipboardList size={16} />
                Compras Realizadas ({historyEntries.length})
              </button>
              <button
                onClick={() => setActiveTab('returns')}
                className={`flex-1 py-3.5 text-center font-bold text-sm border-b-2 transition-all flex items-center justify-center gap-2
                  ${activeTab === 'returns'
                    ? 'border-orange-500 text-orange-600 bg-orange-50/10'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
              >
                <Tag size={16} />
                Devoluciones y Ajustes ({historyLogs.length})
              </button>
            </div>

            {/* Cuerpo del Historial (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 max-h-[450px]">
              {historyLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-gray-400 animate-pulse">Cargando historial de transacciones...</p>
                </div>
              ) : activeTab === 'purchases' ? (
                /* ── PESTAÑA COMPRAS ── */
                <div className="space-y-3">
                  {historyEntries.length === 0 ? (
                    <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-100 shadow-sm">
                      <ClipboardList size={36} className="mx-auto mb-2 opacity-25 text-blue-500" />
                      <p className="text-sm font-medium">No se registran compras para este proveedor.</p>
                    </div>
                  ) : (
                    historyEntries.map(entry => {
                      const isExpanded = expandedEntryId === entry.id;
                      return (
                        <div 
                          key={entry.id}
                          className="bg-white rounded-xl border border-gray-200/80 shadow-sm hover:shadow transition-shadow overflow-hidden"
                        >
                          {/* Fila Principal */}
                          <div 
                            onClick={() => toggleEntryExpand(entry.id)}
                            className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 cursor-pointer hover:bg-slate-50/50"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-gray-700">
                                  {formatDateTime(entry.dateObj)}
                                </span>
                                {entry.invoiceNo && (
                                  <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded font-mono font-bold">
                                    Factura: {entry.invoiceNo}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400">
                                Cargado por: <span className="font-medium text-gray-500">{entry.registeredBy || 'Admin'}</span>
                                {entry.notes && <span className="italic"> — "{entry.notes}"</span>}
                              </p>
                            </div>
                            
                            <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                              <div className="text-right">
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Monto Compra</p>
                                <p className="font-black text-sm text-blue-600">
                                  {entry.totalCost ? `₲ ${entry.totalCost.toLocaleString()}` : 'Sin costo de caja'}
                                </p>
                              </div>
                              <div className="text-gray-400">
                                {isExpanded ? <X size={16} /> : <span className="text-xs font-bold text-blue-500 bg-blue-50 px-2 py-1 rounded">Ver Detalle</span>}
                              </div>
                            </div>
                          </div>

                          {/* Detalle Expandido */}
                          {isExpanded && (
                            <div className="bg-slate-50/80 border-t border-gray-100 px-4 py-3 animate-fadeIn">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Desglose de Productos</p>
                              <div className="space-y-2">
                                {entry.items?.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center bg-white p-2 rounded-lg border border-gray-100 text-xs">
                                    <span className="font-semibold text-gray-700">{item.productName}</span>
                                    <div className="flex gap-4">
                                      <span className="text-gray-500">Cant: <strong className="text-gray-800">{item.qtyIn}</strong></span>
                                      <span className="text-gray-500">Costo: <strong className="text-gray-800">₲ {(item.newCost || 0).toLocaleString()}</strong></span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                /* ── PESTAÑA DEVOLUCIONES / AJUSTES ── */
                <div className="space-y-3">
                  {historyLogs.length === 0 ? (
                    <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-100 shadow-sm">
                      <Tag size={36} className="mx-auto mb-2 opacity-25 text-orange-500" />
                      <p className="text-sm font-medium">No se registran devoluciones ni ajustes para este proveedor.</p>
                    </div>
                  ) : (
                    historyLogs.map(log => {
                      const isReturn = log.reason === 'Devolución' || log.change < 0;
                      return (
                        <div 
                          key={log.id}
                          className={`bg-white p-4 rounded-xl border shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3
                            ${isReturn ? 'border-l-4 border-l-orange-500 border-gray-200' : 'border-l-4 border-l-emerald-500 border-gray-200'}`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-gray-700">
                                {formatDateTime(log.dateObj)}
                              </span>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider
                                ${log.reason === 'Devolución'
                                  ? 'bg-orange-50 text-orange-600 border-orange-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
                              >
                                {log.reason}
                              </span>
                            </div>
                            <h4 className="text-xs font-black text-gray-800">{log.variantName}</h4>
                            {log.note && (
                              <p className="text-[11px] text-gray-400 italic">
                                "{log.note}"
                              </p>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end shrink-0">
                            <div className="text-right">
                              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Ajuste Stock</p>
                              <p className={`font-black text-sm ${log.change < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                {log.change > 0 ? `+${log.change}` : log.change}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Registrado por</p>
                              <p className="text-xs font-semibold text-gray-600">{log.user || 'Admin'}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Pie del modal */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="bg-gray-200 text-gray-700 hover:bg-gray-300 font-bold px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                CERRAR FICHA
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
