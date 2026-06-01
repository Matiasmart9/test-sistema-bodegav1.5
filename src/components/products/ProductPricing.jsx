import React from 'react';
import { Percent } from 'lucide-react'; // Importamos Percent
import { formatGuaranies, parseGuaranies } from '../../utils/moneyUtils';

export default function ProductPricing({ formData, setFormData }) {
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    let parsedValue;
    if (name === 'price' || name === 'cost') {
      parsedValue = parseGuaranies(value);
    } else {
      parsedValue = parseFloat(value) || 0;
    }
    setFormData(prev => ({
      ...prev,
      [name]: parsedValue
    }));
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      <h3 className="text-lg font-bold text-gray-800 mb-4">Precios e Impuestos</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* PRECIO VENTA */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Precio de Venta</label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-gray-400 font-bold text-sm select-none">Gs</span>
            <input 
              type="text" 
              inputMode="numeric"
              name="price"
              value={formatGuaranies(formData.price)}
              onChange={handleChange}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* COSTO */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Costo (Opcional)</label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-gray-400 font-bold text-sm select-none">Gs</span>
            <input 
              type="text" 
              inputMode="numeric"
              name="cost"
              value={formatGuaranies(formData.cost)}
              onChange={handleChange}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* SELECTOR DE IVA (NUEVO) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Impuesto (IVA) *</label>
          <div className="relative">
            <Percent className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <select 
              name="tax"
              value={formData.tax}
              onChange={handleChange}
              className="w-full pl-10 pr-8 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-primary appearance-none bg-white"
            >
                <option value={10}>IVA 10% (General)</option>
                <option value={5}>IVA 5% (Canasta)</option>
                <option value={0}>Exenta</option>
            </select>
          </div>
        </div>

      </div>
    </div>
  );
}