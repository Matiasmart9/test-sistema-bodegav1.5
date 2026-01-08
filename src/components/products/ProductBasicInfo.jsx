import React, { useState } from 'react';
import { Plus, Trash2, Check, X } from 'lucide-react';

const COLORS = ['#cbd5e1', '#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

// Recibimos 'categories' y 'onAddCategory' como props
export default function ProductBasicInfo({ formData, setFormData, categories, onAddCategory, onDeleteCategory }) {
  
  // Estado local para manejar la UI de "Agregar Categoría"
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    // Manejo especial para checkboxes
    setFormData(prev => ({ 
        ...prev, 
        [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const selectColor = (color) => {
    setFormData(prev => ({ ...prev, color: color }));
  };

  // Guardar la nueva categoría
  const saveNewCategory = () => {
     if (newCategoryName.trim()) {
      onAddCategory(newCategoryName.trim());
      setNewCategoryName('');
      setIsAddingCategory(false);
    }
  }

return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 mb-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Información Básica</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* COLUMNA IZQUIERDA (Datos) - Ocupa 2 espacios */}
        <div className="md:col-span-2 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del artículo *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder=""
              className="w-full px-0 py-2 border-b-2 border-gray-200 focus:border-primary outline-none transition-colors text-lg"
            />
            {!formData.name && <p className="text-xs text-red-500 mt-1">El campo no puede estar en blanco</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
            {!isAddingCategory ? (
              <div className="flex gap-2">
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-primary outline-none bg-white"
                >
                  {categories.map((cat, index) => (
                    <option key={index} value={cat}>{cat}</option>
                  ))}
                </select>
                <button onClick={() => setIsAddingCategory(true)} className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded">
                  <Plus size={20} />
                </button>
                {formData.category !== 'Sin categoría' && (
                  <button onClick={() => onDeleteCategory(formData.category)} className="p-2 bg-red-50 text-red-500 rounded border border-red-100">
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            ) : (
               <div className="flex gap-2">
                <input 
                  type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full px-3 py-2 border border-primary rounded focus:outline-none" autoFocus
                  onKeyPress={(e) => e.key === 'Enter' && saveNewCategory()}
                />
                <button onClick={saveNewCategory} className="p-2 bg-primary text-white rounded"><Check size={20} /></button>
                <button onClick={() => setIsAddingCategory(false)} className="p-2 bg-red-100 text-red-600 rounded"><X size={20} /></button>
              </div>
            )}
          </div>
          
          <div>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="2"
              placeholder="Descripción"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:border-primary outline-none resize-none"
            />
          </div>

          {/* --- NUEVO: DISPONIBLE PARA VENTA --- */}
          <div className="flex items-center gap-2 pt-2">
             <input 
                type="checkbox" 
                id="is_available"
                name="is_available"
                checked={formData.is_available !== false} // Default true
                onChange={handleChange}
                className="w-5 h-5 text-primary focus:ring-primary border-gray-300 rounded cursor-pointer"
             />
             <label htmlFor="is_available" className="text-gray-700 cursor-pointer select-none">
                El artículo está disponible para la venta
             </label>
          </div>

          {/* --- NUEVO: VENDIDO POR --- */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Vendido por</label>
            <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                        type="radio" 
                        name="sold_by" 
                        value="unit"
                        checked={formData.sold_by === 'unit'}
                        onChange={handleChange}
                        className="text-primary focus:ring-primary w-4 h-4"
                    />
                    <span>Unidad</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                        type="radio" 
                        name="sold_by" 
                        value="weight"
                        checked={formData.sold_by === 'weight'}
                        onChange={handleChange}
                        className="text-primary focus:ring-primary w-4 h-4"
                    />
                    <span>Peso/Volumen</span>
                </label>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA (Representación Visual) - Ocupa 1 espacio */}
        <div className="bg-gray-50 p-4 rounded-lg flex flex-col items-center h-fit">
          <label className="text-xs font-bold text-gray-500 uppercase mb-4 self-start">Representación en TPV</label>
          <div className="w-24 h-24 rounded-lg flex items-center justify-center text-white font-bold text-center shadow-md mb-6" style={{ backgroundColor: formData.color }}>
            {formData.name || "Artículo"}
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            {COLORS.map(color => (
              <button key={color} onClick={() => selectColor(color)} className={`w-8 h-8 rounded-full border-2 ${formData.color === color ? 'border-gray-600 scale-110' : 'border-transparent'}`} style={{ backgroundColor: color }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}