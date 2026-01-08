import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Save, Store, Receipt, MapPin, Phone, FileText, Loader2, Hash } from 'lucide-react';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Estado inicial con todos los campos
  const [config, setConfig] = useState({
    storeName: '',
    storeRuc: '',
    timbrado: '', // <--- NUEVO CAMPO
    address: '',
    phone: '',
    ticketFooter: '*** GRACIAS POR SU PREFERENCIA ***'
  });

  // Cargar configuración
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const docRef = doc(db, "settings", "general");
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setConfig(docSnap.data());
        } else {
          // Valores por defecto
          setConfig({
            storeName: 'BODEGA EL GRIFO',
            storeRuc: '1234567-8',
            timbrado: '12345678',
            address: 'Ruta 1 - San Ignacio Misiones',
            phone: '0981 123 456',
            ticketFooter: '*** GRACIAS POR SU PREFERENCIA ***'
          });
        }
      } catch (error) {
        console.error("Error cargando configuración:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const docRef = doc(db, "settings", "general");
      await setDoc(docRef, config);
      alert("✅ Datos guardados correctamente");
    } catch (error) {
      console.error(error);
      alert("❌ Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary"/></div>;

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Configuración</h1>
        <p className="text-sm text-gray-500">Datos fiscales y de contacto para el ticket.</p>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* TARJETA 1: DATOS DEL NEGOCIO */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Store className="text-primary" size={20}/> Datos de la Empresa
            </h3>
            
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre de Fantasía</label>
                    <input 
                        type="text" 
                        value={config.storeName} 
                        onChange={e => setConfig({...config, storeName: e.target.value})} 
                        className="w-full border rounded-lg p-2 focus:outline-none focus:border-primary font-bold text-gray-700"
                    />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">RUC</label>
                        <input 
                            type="text" 
                            value={config.storeRuc} 
                            onChange={e => setConfig({...config, storeRuc: e.target.value})} 
                            className="w-full border rounded-lg p-2 focus:outline-none focus:border-primary"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Timbrado</label>
                        <input 
                            type="text" 
                            value={config.timbrado} 
                            onChange={e => setConfig({...config, timbrado: e.target.value})} 
                            className="w-full border rounded-lg p-2 focus:outline-none focus:border-primary"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1"><MapPin size={12}/> Dirección</label>
                    <input 
                        type="text" 
                        value={config.address} 
                        onChange={e => setConfig({...config, address: e.target.value})} 
                        className="w-full border rounded-lg p-2 focus:outline-none focus:border-primary"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1"><Phone size={12}/> Teléfono</label>
                    <input 
                        type="text" 
                        value={config.phone} 
                        onChange={e => setConfig({...config, phone: e.target.value})} 
                        className="w-full border rounded-lg p-2 focus:outline-none focus:border-primary"
                    />
                </div>
            </div>
        </div>

        {/* TARJETA 2: VISTA PREVIA Y PIE */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Receipt className="text-purple-600" size={20}/> Diseño del Ticket
            </h3>
            
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1"><FileText size={12}/> Mensaje Pie de Página</label>
                    <textarea 
                        rows="3"
                        value={config.ticketFooter} 
                        onChange={e => setConfig({...config, ticketFooter: e.target.value})} 
                        className="w-full border rounded-lg p-2 focus:outline-none focus:border-primary text-sm font-mono"
                    ></textarea>
                </div>

                <div className="bg-gray-100 p-4 rounded-lg border border-gray-200 mt-4 flex justify-center">
                    <div className="bg-white p-4 border border-gray-300 shadow-sm font-mono text-[10px] text-center w-48">
                        <p className="font-black text-sm">{config.storeName || 'NOMBRE NEGOCIO'}</p>
                        <p>RUC: {config.storeRuc}</p>
                        <p>Timbrado: {config.timbrado}</p>
                        <p>{config.address}</p>
                        <p>Tel: {config.phone}</p>
                        <div className="border-b border-dashed border-gray-400 my-2"></div>
                        <p className="text-gray-400 py-2">[...ITEMS...]</p>
                        <div className="border-b border-dashed border-gray-400 my-2"></div>
                        <p className="whitespace-pre-wrap">{config.ticketFooter}</p>
                    </div>
                </div>
            </div>
        </div>

        <div className="md:col-span-2 flex justify-end mt-4">
            <button 
                type="submit" 
                disabled={saving}
                className="bg-primary text-white px-8 py-3 rounded-xl font-bold hover:bg-green-600 shadow-lg shadow-green-200 flex items-center gap-2 disabled:opacity-50 transition-all active:scale-95"
            >
                {saving ? <Loader2 className="animate-spin"/> : <Save size={20}/>}
                GUARDAR CONFIGURACIÓN
            </button>
        </div>

      </form>
    </div>
  );
}