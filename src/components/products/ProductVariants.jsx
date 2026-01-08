import React, { useState, useEffect } from 'react';
import { Plus, Trash2, X } from 'lucide-react';

export default function ProductVariants({ formData, setFormData }) {
  const [optionDefinitions, setOptionDefinitions] = useState([]);

  // --- LÓGICA DE GENERACIÓN ---
  const cartesianProduct = (arr) => {
    return arr.reduce((a, b) => {
      return a.map(x => b.map(y => x.concat([y]))).reduce((c, d) => c.concat(d), []);
    }, [[]]);
  };

  useEffect(() => {
    if (optionDefinitions.length === 0) return;

    const validDefinitions = optionDefinitions.filter(d => d.values.length > 0);
    if (validDefinitions.length === 0) return;

    const valuesArrays = validDefinitions.map(d => d.values);
    const combinations = cartesianProduct(valuesArrays);

    const newVariants = combinations.map(combination => {
      const combinationName = combination.join(' / ');
      
      const existing = formData.variants?.find(v => {
          if (v.attributes && JSON.stringify(v.attributes.map(a=>a.value)) === JSON.stringify(combination)) return true;
          return false;
      });

      if (existing) return existing;

      return {
        name: combinationName, 
        price: formData.price || 0,
        cost: formData.cost || 0,
        stock: 0,
        low_stock: 5,
        sku: '',
        is_active: true,
        tax: formData.tax || 10,
        attributes: combination.map((val, idx) => ({
             name: validDefinitions[idx].name,
             value: val
        }))
      };
    });

    setFormData(prev => ({ ...prev, variants: newVariants }));
  }, [optionDefinitions]);


  // --- MANEJO DE INPUTS ---
  const addOptionDefinition = () => {
    setOptionDefinitions([...optionDefinitions, { id: Date.now(), name: '', values: [], currentInputValue: '' }]);
  };

  const removeOptionDefinition = (id) => {
    setOptionDefinitions(optionDefinitions.filter(opt => opt.id !== id));
  };

  // Este es para el generador de etiquetas (NO TOCAR)
  const handleKeyDown = (e, id) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault(); 
      const opt = optionDefinitions.find(o => o.id === id);
      const rawValue = opt.currentInputValue;
      const splitValues = rawValue.split(',').map(v => v.trim().toUpperCase()).filter(v => v !== '');

      if (splitValues.length > 0) {
        const newValues = [...opt.values];
        splitValues.forEach(val => {
            if (!newValues.includes(val)) {
                newValues.push(val);
            }
        });
        const newDefs = optionDefinitions.map(d => d.id === id ? { ...d, values: newValues, currentInputValue: '' } : d);
        setOptionDefinitions(newDefs);
      }
    }
  };

  // --- NUEVA FUNCIÓN PARA BLOQUEAR ENTER EN LA TABLA ---
  const preventEnter = (e) => {
    if (e.key === 'Enter') e.preventDefault();
  };

  const removeValue = (id, valueToRemove) => {
    const newDefs = optionDefinitions.map(d => d.id === id ? { ...d, values: d.values.filter(v => v !== valueToRemove) } : d);
    setOptionDefinitions(newDefs);
  };

  // --- MANEJO DE TABLA ---
  const updateVariantRow = (index, field, value) => {
    const newVariants = [...formData.variants];
    newVariants[index] = { ...newVariants[index], [field]: value };
    setFormData(prev => ({ ...prev, variants: newVariants }));
  };

  const deleteVariant = (index) => {
    if(window.confirm("¿Eliminar esta variante?")) {
        const newVariants = formData.variants.filter((_, i) => i !== index);
        setFormData(prev => ({ ...prev, variants: newVariants }));
    }
  };

  // --- RENDERIZADO VISUAL ---
  const renderCombinationBadge = (variant) => {
    if (variant.attributes && variant.attributes.length > 0) {
        return (
            <div className="flex flex-col gap-2 items-start justify-center h-full py-1">
                {variant.attributes.map((attr, idx) => (
                    <div key={idx} className="flex flex-col leading-none pl-2 border-l-2 border-blue-400">
                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">{attr.name}</span>
                        <span className="text-sm font-black text-gray-800 uppercase">{attr.value}</span>
                    </div>
                ))}
            </div>
        );
    }
    return <span className="font-bold text-gray-800">{variant.name}</span>;
  };

  return (
    <div className="space-y-6">
      
      {/* 1. GENERADOR */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
         <h3 className="text-lg font-bold text-gray-800 mb-2">Generador de Variantes</h3>
         <p className="text-sm text-gray-500 mb-4">Define características y valores (Ej: LITROS - 350ML, 500ML).</p>
         
         {optionDefinitions.map((opt) => (
             <div key={opt.id} className="mb-4 pb-4 border-b border-gray-100 last:border-0">
                 <div className="flex flex-col md:flex-row gap-4 items-start">
                    <div className="w-full md:w-1/3">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Característica</label>
                        <input type="text" placeholder="Ej: LITROS" value={opt.name} onChange={(e) => {
                                const newDefs = optionDefinitions.map(d => d.id === opt.id ? { ...d, name: e.target.value.toUpperCase() } : d);
                                setOptionDefinitions(newDefs);
                            }} className="w-full px-3 py-2 border-b-2 border-gray-200 focus:border-primary outline-none bg-transparent font-bold text-gray-700"/>
                    </div>
                    <div className="w-full md:w-2/3 relative">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Valores</label>
                        <div className="flex flex-wrap gap-2 items-center bg-gray-50 p-2 rounded-lg border border-gray-200 focus-within:border-primary focus-within:bg-white transition-colors">
                            {opt.values.map((val, idx) => (
                                <span key={idx} className="bg-white shadow-sm text-gray-800 px-3 py-1 rounded border border-gray-300 flex items-center gap-2 font-black text-xs">
                                    {val}
                                    <button type="button" onClick={() => removeValue(opt.id, val)} className="text-gray-400 hover:text-red-500"><X size={14} strokeWidth={3}/></button>
                                </span>
                            ))}
                            <input type="text" value={opt.currentInputValue || ''} onChange={(e) => { 
                                    const newDefs = optionDefinitions.map(d => d.id === opt.id ? { ...d, currentInputValue: e.target.value } : d); 
                                    setOptionDefinitions(newDefs); 
                                }} onKeyDown={(e) => handleKeyDown(e, opt.id)} className="flex-1 min-w-[120px] outline-none py-1 bg-transparent font-medium" placeholder="Escribe (Ej: 350, 500)..."/>
                        </div>
                        <button type="button" onClick={() => removeOptionDefinition(opt.id)} className="absolute top-2 right-2 text-red-300 hover:text-red-500"><Trash2 size={18} /></button>
                    </div>
                </div>
             </div>
         ))}
         <button type="button" onClick={addOptionDefinition} className="mt-2 text-primary font-bold text-sm flex items-center gap-2 hover:bg-green-50 px-3 py-2 rounded transition-colors border border-dashed border-primary/30"><Plus size={16} /> Agregar Nueva Característica</button>
      </div>

      {/* 2. TABLA DE RESULTADOS */}
      {formData.variants && formData.variants.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
            <h4 className="font-bold text-gray-700 text-sm">Lista de Variantes ({formData.variants.length})</h4>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse min-w-max">
              <thead className="bg-gray-100 text-gray-600 font-bold border-b-2 border-gray-300 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 w-10 text-center">#</th>
                  <th className="px-4 py-3 w-[150px] text-gray-800">Detalle</th> 
                  <th className="px-4 py-3 min-w-[200px]">Nombre Ticket</th>
                  <th className="px-4 py-3 min-w-[140px] bg-blue-50 text-blue-800 border-l border-r border-blue-100 text-center">Precio Venta</th>
                  <th className="px-4 py-3 min-w-[140px] text-gray-500 text-center">Costo</th>
                  <th className="px-4 py-3 min-w-[90px] text-center">IVA</th>
                  <th className="px-4 py-3 w-24 text-center">Stock</th>
                  <th className="px-4 py-3 w-24 text-orange-600 text-center">Min.</th>
                  <th className="px-4 py-3 w-32">Código</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-300">
                {formData.variants.map((variant, idx) => (
                  <tr key={idx} className={`hover:bg-blue-50/30 transition-colors ${!variant.is_active ? 'opacity-50 bg-gray-100' : 'bg-white'}`}>
                    
                    <td className="px-4 py-3 text-center align-middle border-r border-gray-100">
                      <input type="checkbox" checked={variant.is_active} onChange={(e) => updateVariantRow(idx, 'is_active', e.target.checked)} className="cursor-pointer w-4 h-4 text-primary" />
                    </td>

                    <td className="px-4 py-3 align-middle border-r border-gray-100">
                        {renderCombinationBadge(variant)}
                    </td>

                    <td className="px-4 py-3 align-middle border-r border-gray-100">
                      <input type="text" value={variant.name} onChange={(e) => updateVariantRow(idx, 'name', e.target.value)} className="w-full text-sm font-medium text-gray-600 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary outline-none focus:bg-white px-1" />
                    </td>

                    {/* PRECIO */}
                    <td className="px-2 py-2 align-middle bg-blue-50/10 border-l border-r border-blue-50">
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-blue-400 text-xs font-bold">₲</span>
                            <input 
                                type="number" 
                                value={variant.price} 
                                onChange={(e) => updateVariantRow(idx, 'price', e.target.value)} 
                                className="w-full bg-white border border-blue-200 rounded-md py-2 pl-6 pr-3 text-right font-bold text-blue-700 shadow-sm focus:ring-2 focus:ring-blue-200 outline-none" 
                            />
                        </div>
                    </td>

                     {/* COSTO */}
                     <td className="px-2 py-2 align-middle border-r border-gray-100">
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-gray-300 text-xs font-bold">₲</span>
                            <input 
                                type="number" 
                                value={variant.cost} 
                                onChange={(e) => updateVariantRow(idx, 'cost', e.target.value)} 
                                className="w-full bg-white border border-gray-200 rounded-md py-2 pl-6 pr-3 text-right text-gray-600 outline-none focus:border-gray-400" 
                                placeholder="0"
                            />
                        </div>
                    </td>

                    {/* IVA */}
                    <td className="px-2 py-2 align-middle border-r border-gray-100">
                        <select value={variant.tax || 10} onChange={(e) => updateVariantRow(idx, 'tax', parseInt(e.target.value))} className="w-full bg-white border border-gray-200 rounded-md py-2 px-1 text-xs text-center focus:border-primary outline-none cursor-pointer">
                            <option value={10}>10%</option>
                            <option value={5}>5%</option>
                            <option value={0}>Exe</option>
                        </select>
                    </td>

                    {/* STOCK */}
                    <td className="px-2 py-2 align-middle border-r border-gray-100">
                       <input type="number" value={variant.stock} onChange={(e) => updateVariantRow(idx, 'stock', e.target.value)} className="w-full bg-white border border-gray-300 rounded-md py-2 text-center font-bold text-gray-800 focus:border-primary outline-none" />
                    </td>

                    {/* MIN STOCK */}
                    <td className="px-2 py-2 align-middle border-r border-gray-100">
                       <input type="number" value={variant.low_stock} onChange={(e) => updateVariantRow(idx, 'low_stock', e.target.value)} className="w-full bg-white border border-orange-200 text-orange-600 rounded-md py-2 text-center font-bold outline-none focus:border-orange-500" />
                    </td>

                    {/* SKU CON BLOQUEO DE ENTER */}
                    <td className="px-2 py-2 align-middle border-r border-gray-100">
                       <input 
                            type="text" 
                            value={variant.sku} 
                            onChange={(e) => updateVariantRow(idx, 'sku', e.target.value)} 
                            onKeyDown={preventEnter} // <--- AQUÍ ESTÁ EL CAMBIO
                            className="w-full bg-gray-50 border border-gray-200 rounded-md py-2 px-2 text-xs text-gray-500 focus:border-primary outline-none" 
                       />
                    </td>

                    <td className="px-2 py-2 text-center align-middle">
                        <button type="button" onClick={() => deleteVariant(idx)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}