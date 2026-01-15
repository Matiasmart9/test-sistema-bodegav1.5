import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Tag, Edit, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from '../../firebase/config';

export default function DiscountsList() {
  const navigate = useNavigate();
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDiscounts = async () => {
      try {
        const snap = await getDocs(collection(db, "discounts"));
        setDiscounts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) { console.error(error); } finally { setLoading(false); }
    };
    fetchDiscounts();
  }, []);

  const handleDelete = async (id) => {
    if (window.confirm("¿Eliminar este descuento?")) {
      await deleteDoc(doc(db, "discounts", id));
      setDiscounts(prev => prev.filter(d => d.id !== id));
    }
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-primary"/></div>;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Tag className="text-primary"/> Descuentos y Promos
        </h1>
        <button onClick={() => navigate('/descuentos/nuevo')} className="bg-primary text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-600 font-bold shadow-sm transition-colors">
            <Plus size={20}/> Nuevo Descuento
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {discounts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No hay descuentos cargados.</div>
        ) : (
            <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 uppercase text-xs font-bold">
                    <tr>
                        <th className="p-4">Nombre</th>
                        <th className="p-4">Tipo</th>
                        <th className="p-4">Valor</th>
                        <th className="p-4 text-right">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {discounts.map(d => (
                        <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                            <td className="p-4 font-bold text-gray-800">{d.name}</td>
                            <td className="p-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${d.type === 'percentage' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                    {d.type === 'percentage' ? 'Porcentaje %' : 'Monto Fijo ₲'}
                                </span>
                            </td>
                            <td className="p-4 font-mono font-bold text-gray-700">
                                {/* LOGICA DE VISUALIZACIÓN */}
                                {d.value ? (
                                    d.type === 'percentage' ? `${d.value}%` : `₲ ${parseInt(d.value).toLocaleString()}`
                                ) : (
                                    <span className="text-orange-500 text-xs flex items-center gap-1">
                                        <AlertCircle size={14}/> Variable en Caja
                                    </span>
                                )}
                            </td>
                            <td className="p-4 text-right flex justify-end gap-2">
                                <button onClick={() => navigate(`/descuentos/editar/${d.id}`)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"><Edit size={18}/></button>
                                <button onClick={() => handleDelete(d.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18}/></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
      </div>
    </div>
  );
}