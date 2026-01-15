import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, addDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Save, Tag, ArrowLeft, Info } from 'lucide-react';

export default function DiscountForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  // Inicializamos value como string vacía para el input
  const [formData, setFormData] = useState({ name: '', type: 'fixed', value: '' });

  useEffect(() => {
    if (id) {
        getDoc(doc(db, "discounts", id)).then(snap => {
            if(snap.exists()) {
                const data = snap.data();
                // Si viene null de la BD (variable), lo ponemos como string vacía en el input
                setFormData({ ...data, value: data.value === null ? '' : data.value });
            }
        });
    }
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Lógica: Si el campo está vacío, guardamos null. Si tiene numero, guardamos el float.
    const finalValue = formData.value === '' ? null : parseFloat(formData.value);

    const dataToSave = { 
        ...formData, 
        value: finalValue 
    };

    if (id) await updateDoc(doc(db, "discounts", id), dataToSave);
    else await addDoc(collection(db, "discounts"), dataToSave);
    
    navigate('/descuentos');
  };

  return (
    <div className="max-w-md mx-auto p-6 mt-10 bg-white rounded-xl shadow-lg border border-gray-100">
        <div className="flex items-center gap-2 mb-6">
            <button onClick={() => navigate('/descuentos')} className="p-1 hover:bg-gray-100 rounded-full"><ArrowLeft size={20} className="text-gray-500"/></button>
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Tag className="text-primary"/> {id ? 'Editar' : 'Nuevo'} Descuento
            </h2>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-5">
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre Promoción</label>
                <input type="text" required value={formData.name} onChange={e=>setFormData({...formData, name:e.target.value})} className="w-full border border-gray-300 p-2.5 rounded-lg focus:outline-none focus:border-primary" placeholder="Ej: Promo Skol 3x10"/>
            </div>
            
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo de Descuento</label>
                <div className="grid grid-cols-2 gap-4">
                    <label className={`flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${formData.type === 'percentage' ? 'border-primary bg-green-50 text-primary font-bold' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <input type="radio" name="type" className="hidden" checked={formData.type === 'percentage'} onChange={()=>setFormData({...formData, type:'percentage'})} />
                        Porcentaje (%)
                    </label>
                    <label className={`flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${formData.type === 'fixed' ? 'border-primary bg-green-50 text-primary font-bold' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <input type="radio" name="type" className="hidden" checked={formData.type === 'fixed'} onChange={()=>setFormData({...formData, type:'fixed'})} />
                        Monto Fijo (₲)
                    </label>
                </div>
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Valor del Descuento</label>
                <input 
                    type="number" 
                    // NO ES REQUIRED AHORA
                    value={formData.value} 
                    onChange={e=>setFormData({...formData, value:e.target.value})} 
                    className="w-full border border-gray-300 p-2.5 rounded-lg text-lg font-bold focus:outline-none focus:border-primary" 
                    placeholder={formData.type === 'fixed' ? "Dejar vacío para variable" : "0"}
                />
                
                {/* MENSAJE DE AYUDA CONDICIONAL */}
                {formData.value === '' && formData.type === 'fixed' ? (
                    <p className="text-xs text-orange-600 mt-2 flex items-start gap-1 bg-orange-50 p-2 rounded">
                        <Info size={14} className="mt-0.5 shrink-0"/> Para especificar el valor durante la venta, deje el campo en blanco.
                    </p>
                ) : (
                    <p className="text-xs text-gray-400 mt-1">Ej: Si es porcentaje: 10 = 10%. Si es fijo: 5000 = ₲ 5.000</p>
                )}
            </div>

            <div className="flex gap-3 pt-4">
                <button type="button" onClick={()=>navigate('/descuentos')} className="flex-1 border border-gray-300 py-2.5 rounded-lg font-bold text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 bg-primary text-white py-2.5 rounded-lg font-bold hover:bg-green-600 flex justify-center gap-2 shadow-lg shadow-green-100 transition-colors"><Save size={20}/> Guardar</button>
            </div>
        </form>
    </div>
  );
}