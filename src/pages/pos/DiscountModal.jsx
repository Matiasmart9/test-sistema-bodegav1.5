import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { X, Tag, Plus, Minus, Loader2, Edit2 } from 'lucide-react';

export default function DiscountModal({ onClose, onApply }) {
  const [discounts, setDiscounts] = useState([]);
  const [selectedDiscounts, setSelectedDiscounts] = useState({}); // { id: quantity }
  const [variableValues, setVariableValues] = useState({}); // { id: monto_ingresado }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDiscounts = async () => {
        try {
            const snap = await getDocs(collection(db, "discounts"));
            // Ordenamos para que los definidos salgan primero
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setDiscounts(data);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };
    fetchDiscounts();
  }, []);

  const handleIncrease = (disc) => {
      // 1. Si es variable (value es null o 0) y aún no se definió monto, PREGUNTAR
      if (!disc.value && !variableValues[disc.id]) {
          const amountStr = prompt(`Ingrese el monto de descuento para "${disc.name}":`);
          const amount = parseFloat(amountStr);
          
          if (!amount || isNaN(amount) || amount <= 0) return; // Cancelado o inválido
          
          setVariableValues(prev => ({ ...prev, [disc.id]: amount }));
      }

      // 2. Aumentar cantidad
      setSelectedDiscounts(prev => ({
          ...prev,
          [disc.id]: (prev[disc.id] || 0) + 1
      }));
  };

  const handleDecrease = (id) => {
      setSelectedDiscounts(prev => {
          const current = prev[id] || 0;
          const newQty = Math.max(0, current - 1);
          const copy = { ...prev };
          if (newQty === 0) {
              delete copy[id];
              // Opcional: Limpiar el valor variable si la cantidad llega a 0
              // setVariableValues(v => { const c = {...v}; delete c[id]; return c; });
          } else {
              copy[id] = newQty;
          }
          return copy;
      });
  };

  // Permite editar el valor variable si se equivocó
  const handleEditVariable = (disc) => {
      const currentVal = variableValues[disc.id] || 0;
      const amountStr = prompt(`Editar monto para "${disc.name}":`, currentVal);
      const amount = parseFloat(amountStr);
      if (amount && !isNaN(amount) && amount > 0) {
          setVariableValues(prev => ({ ...prev, [disc.id]: amount }));
      }
  };

  const handleApply = () => {
      const result = [];
      discounts.forEach(d => {
          if (selectedDiscounts[d.id]) {
              // Si es variable, usamos el valor ingresado, si es fijo, usamos el de DB
              const finalValue = d.value ? d.value : (variableValues[d.id] || 0);
              
              result.push({ 
                  ...d, 
                  value: finalValue, // Aquí inyectamos el valor real para que PosTerminal calcule
                  quantity: selectedDiscounts[d.id] 
              });
          }
      });
      onApply(result);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="bg-primary p-4 flex justify-between items-center text-white shrink-0">
            <h3 className="font-bold text-lg flex items-center gap-2"><Tag/> Aplicar Promociones</h3>
            <button onClick={onClose} className="hover:bg-white/20 p-1 rounded-full"><X/></button>
        </div>
        
        <div className="p-4 overflow-y-auto flex-1 space-y-3 bg-gray-50">
            {loading ? <div className="flex justify-center p-4"><Loader2 className="animate-spin text-primary"/></div> : 
             discounts.length === 0 ? <p className="text-center text-gray-500 py-4">No hay descuentos configurados.</p> :
            
            discounts.map(disc => {
                const qty = selectedDiscounts[disc.id] || 0;
                const isVariable = !disc.value;
                const currentVarValue = variableValues[disc.id];

                return (
                    <div key={disc.id} className={`flex justify-between items-center p-3 rounded-xl border transition-all ${qty > 0 ? 'border-primary bg-green-50 shadow-sm' : 'border-gray-200 bg-white'}`}>
                        <div className="flex-1">
                            <p className="font-bold text-gray-800">{disc.name}</p>
                            <div className="text-xs text-gray-500 font-medium flex items-center gap-2">
                                {isVariable ? (
                                    currentVarValue ? (
                                        <span className="text-blue-600 font-bold flex items-center gap-1">
                                            Valor: ₲ {currentVarValue.toLocaleString()} 
                                            <button onClick={() => handleEditVariable(disc)} className="text-gray-400 hover:text-blue-600"><Edit2 size={10}/></button>
                                        </span>
                                    ) : (
                                        <span className="text-orange-500">Monto a definir...</span>
                                    )
                                ) : (
                                    disc.type === 'fixed' ? `Desc: ₲ ${parseInt(disc.value).toLocaleString()}` : `Desc: ${disc.value}%`
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-3 pl-2">
                            <button onClick={() => handleDecrease(disc.id)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${qty > 0 ? 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`} disabled={qty===0}><Minus size={16}/></button>
                            <span className="font-bold w-6 text-center text-lg text-gray-800">{qty}</span>
                            <button onClick={() => handleIncrease(disc)} className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-green-600 shadow-sm"><Plus size={16}/></button>
                        </div>
                    </div>
                );
            })}
        </div>

        <div className="p-4 border-t bg-white">
            <button onClick={handleApply} className="w-full bg-primary text-white py-3.5 rounded-xl font-bold shadow-lg hover:bg-green-600 transition-all active:scale-95">
                CONFIRMAR DESCUENTOS
            </button>
        </div>
      </div>
    </div>
  );
}