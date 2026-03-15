import { sileo } from 'sileo';
import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Users, Search, Plus, Trash2, Edit, Save, X, Mail, Phone, MapPin } from 'lucide-react';

export default function ClientsList() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal Estado
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // 1. AGREGAMOS 'email' AL ESTADO INICIAL
  const [confirmModal, setConfirmModal] = useState(null);
  const [formData, setFormData] = useState({ name: '', ruc: '', phone: '', address: '', email: '' });

  // Cargar Clientes
  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
        const snap = await getDocs(collection(db, "clients"));
        setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
        console.error("Error cargando clientes:", error);
    } finally {
        setLoading(false);
    }
  };

  // Guardar (Crear o Editar)
  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateDoc(doc(db, "clients", editingId), formData);
      } else {
        await addDoc(collection(db, "clients"), formData);
      }
      setShowModal(false);
      setEditingId(null);
      setFormData({ name: '', ruc: '', phone: '', address: '', email: '' }); // Reseteamos
      fetchClients();
    } catch (error) {
      console.error(error);
      sileo.error({ title: "Error al guardar cliente" });
    }
  };

  const handleEdit = (client) => {
    setFormData(client);
    setEditingId(client.id);
    setShowModal(true);
  };

  const handleDelete = (id) => {
    setConfirmModal({
      title: '¿Eliminar este cliente?',
      description: 'El cliente será eliminado del directorio de facturación.',
      confirmText: 'Sí, eliminar',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "clients", id));
          fetchClients();
          sileo.success({ title: 'Cliente eliminado.' });
        } catch (e) { sileo.error({ title: 'Error al eliminar cliente.' }); }
      },
    });
  };

  // Filtrado
  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.ruc.includes(searchTerm)
  );

  return (
    <div className="max-w-6xl mx-auto pb-20">
      {/* Modal de confirmación */}
      {confirmModal && (
        <ConfirmModal {...confirmModal} onClose={() => setConfirmModal(null)} />
      )}

      <div className="flex justify-between items-center mb-6">
        <div>
           <h1 className="text-2xl font-bold text-gray-800">Directorio de Clientes</h1>
           <p className="text-gray-500 text-sm">Gestiona la base de datos para facturación.</p>
        </div>
        <button onClick={() => { setEditingId(null); setFormData({ name: '', ruc: '', phone: '', address: '', email: '' }); setShowModal(true); }} className="bg-primary text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm hover:bg-green-700">
          <Plus size={20} /> Nuevo Cliente
        </button>
      </div>

      {/* Buscador */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex gap-4">
        <div className="relative flex-1">
           <Search className="absolute left-3 top-2.5 text-gray-400" size={20}/>
           <input type="text" placeholder="Buscar por Nombre o RUC..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-primary"/>
        </div>
      </div>

      {/* Lista */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
         {filteredClients.map(client => (
             <div key={client.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow relative group">
                 <div className="flex items-start justify-between">
                    <div>
                        <h3 className="font-bold text-gray-800">{client.name}</h3>
                        <p className="text-sm text-gray-500 font-mono mt-1">RUC: {client.ruc || 'Sin RUC'}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                        <Users size={16}/>
                    </div>
                 </div>
                 
                 {/* DATOS DE CONTACTO */}
                 <div className="mt-4 pt-4 border-t border-gray-50 text-xs text-gray-500 space-y-2">
                    <div className="flex items-center gap-2">
                        <MapPin size={14} className="text-gray-400"/> 
                        <span>{client.address || 'Sin dirección'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Phone size={14} className="text-gray-400"/> 
                        <span>{client.phone || 'Sin teléfono'}</span>
                    </div>
                    {/* MOSTRAMOS EL CORREO */}
                    <div className="flex items-center gap-2">
                        <Mail size={14} className="text-gray-400"/> 
                        <span className="truncate">{client.email || 'Sin correo'}</span>
                    </div>
                 </div>
                 
                 <div className="absolute top-4 right-12 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 bg-white pl-2">
                     <button onClick={() => handleEdit(client)} className="text-blue-500 hover:bg-blue-50 p-1 rounded"><Edit size={16}/></button>
                     <button onClick={() => handleDelete(client.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={16}/></button>
                 </div>
             </div>
         ))}
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="font-bold text-lg">{editingId ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>
                    <button onClick={() => setShowModal(false)}><X size={20} className="text-gray-400"/></button>
                </div>
                <form onSubmit={handleSave} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">Razón Social / Nombre *</label>
                        <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border rounded-lg p-2 mt-1 focus:border-primary outline-none"/>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">RUC / CI</label>
                        <input type="text" value={formData.ruc} onChange={e => setFormData({...formData, ruc: e.target.value})} className="w-full border rounded-lg p-2 mt-1 focus:border-primary outline-none"/>
                    </div>
                    
                    {/* NUEVO CAMPO CORREO */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">Correo Electrónico</label>
                        <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full border rounded-lg p-2 mt-1 focus:border-primary outline-none" placeholder="cliente@ejemplo.com"/>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase">Teléfono</label>
                            <input type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full border rounded-lg p-2 mt-1 focus:border-primary outline-none"/>
                        </div>
                         <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase">Dirección</label>
                            <input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full border rounded-lg p-2 mt-1 focus:border-primary outline-none"/>
                        </div>
                    </div>
                    <button type="submit" className="w-full bg-primary text-white font-bold py-3 rounded-lg hover:bg-green-700 flex justify-center gap-2 mt-2">
                        <Save size={20}/> GUARDAR DATOS
                    </button>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}