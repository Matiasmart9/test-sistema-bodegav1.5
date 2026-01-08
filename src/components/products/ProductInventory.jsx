import React, { useState, useEffect, useRef } from 'react';
import { Info, Trash2 } from 'lucide-react'; // Importamos el icono Info

export default function ProductInventory({ formData, setFormData, availableProducts = [] }) {
  
  // Estado local para el buscador
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef(null); // Para cerrar el dropdown si clicamos fuera

  // Filtrar productos basado en lo que escribe (excluyendo el producto actual si tuviera ID)
  const filteredProducts = availableProducts.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ 
        ...prev, 
        [name]: type === 'checkbox' ? checked : value 
    }));
  };

  // Función para agregar un componente a la lista
  const addComponent = (product) => {
    const currentComponents = formData.components || [];
    
    // Evitar duplicados (opcional)
    if (currentComponents.find(c => c.id === product.id)) {
        alert("Este producto ya está agregado como componente");
        setSearchTerm('');
        setShowDropdown(false);
        return;
    }

    const newComponent = {
        id: product.id,
        name: product.name,
        sku: product.sku || 'S/R',
        quantity: 1, // Cantidad default
        cost: product.cost || 0
    };

    setFormData(prev => ({
        ...prev,
        components: [...currentComponents, newComponent]
    }));

    setSearchTerm('');
    setShowDropdown(false);
  };

  const removeComponent = (id) => {
    const newComponents = (formData.components || []).filter(c => c.id !== id);
    setFormData(prev => ({ ...prev, components: newComponents }));
  };

  const updateComponentQuantity = (id, newQty) => {
    const newComponents = (formData.components || []).map(c => 
        c.id === id ? { ...c, quantity: parseFloat(newQty) || 0 } : c
    );
    setFormData(prev => ({ ...prev, components: newComponents }));
  };

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchRef]);


  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 mb-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Inventario</h3>
      
      {/* 1. ARTÍCULO COMPUESTO CON TOOLTIP */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Artículo compuesto</label>
          
          {/* TOOLTIP PERSONALIZADO */}
          <div className="relative group flex items-center">
            <Info size={16} className="text-gray-400 cursor-help hover:text-gray-600 transition-colors" />
            
            {/* El cuadro de texto flotante */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-white text-gray-600 text-xs rounded-lg shadow-lg border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 text-center pointer-events-none">
              Los artículos compuestos contienen una determinada cantidad de otros artículos
              {/* Triangulito abajo */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-white"></div>
            </div>
          </div>

        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input 
            type="checkbox" 
            name="is_composite"
            checked={formData.is_composite || false}
            onChange={handleChange}
            className="sr-only peer" 
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>

      {/* LÓGICA DEL BUSCADOR DE COMPONENTES */}
      {formData.is_composite && (
        <div className="mb-6 p-4 border border-dashed border-gray-300 rounded-lg bg-gray-50/50">
            
            {/* Tabla de componentes agregados */}
            {(formData.components || []).length > 0 && (
                <div className="mb-4">
                    <div className="flex text-xs font-bold text-gray-500 uppercase mb-2 px-2">
                        <span className="flex-1">Componente</span>
                        <span className="w-24 text-center">Cantidad</span>
                        <span className="w-24 text-right">Coste</span>
                        <span className="w-8"></span>
                    </div>
                    <div className="space-y-2">
                        {formData.components.map((comp) => (
                            <div key={comp.id} className="flex items-center bg-white p-2 rounded border border-gray-200 shadow-sm">
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-800">{comp.name}</p>
                                    <p className="text-xs text-gray-400">{comp.sku}</p>
                                </div>
                                <div className="w-24 px-2">
                                    <input 
                                        type="number" 
                                        value={comp.quantity}
                                        onChange={(e) => updateComponentQuantity(comp.id, e.target.value)}
                                        className="w-full text-center border-b border-gray-300 focus:border-primary outline-none"
                                    />
                                </div>
                                <div className="w-24 text-right text-sm text-gray-600">
                                    ₲ {(comp.cost * comp.quantity).toLocaleString()}
                                </div>
                                <button onClick={() => removeComponent(comp.id)} className="w-8 flex justify-end text-gray-400 hover:text-red-500">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* INPUT BUSCADOR */}
            <div className="relative" ref={searchRef}>
                <label className="text-xs text-gray-500 mb-1 block">Búsqueda de artículos</label>
                <input 
                    type="text" 
                    placeholder="Buscar artículos para agregar..." 
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-primary text-sm bg-white"
                />

                {/* DROPDOWN DE RESULTADOS */}
                {showDropdown && searchTerm.length > 0 && (
                    <div className="absolute w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-20 overflow-hidden">
                        {/* max-h-60 = aprox 240px (5 items de ~48px) 
                            overflow-y-auto = barra de scroll si excede
                        */}
                        <ul className="max-h-60 overflow-y-auto divide-y divide-gray-100">
                            {filteredProducts.length > 0 ? (
                                filteredProducts.map(product => (
                                    <li 
                                        key={product.id}
                                        onClick={() => addComponent(product)}
                                        className="px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors flex flex-col"
                                    >
                                        <span className="text-sm font-medium text-gray-800">{product.name}</span>
                                        <span className="text-xs text-gray-400">REF {product.sku || 'N/A'}</span>
                                    </li>
                                ))
                            ) : (
                                <li className="px-4 py-3 text-sm text-gray-500 text-center">
                                    No se encontraron artículos
                                </li>
                            )}
                        </ul>
                    </div>
                )}
            </div>
        </div>
      )}

      {/* 2. SEGUIR EL INVENTARIO */}
      {!formData.is_composite && (
        <div className="animate-fadeIn">
          <div className="flex justify-between items-center mb-4">
            <label className="text-sm font-medium text-gray-700">Seguir el Inventario</label>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                name="track_stock"
                checked={formData.track_stock || false}
                onChange={handleChange}
                className="sr-only peer" 
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          {formData.track_stock && (
            <div className="grid grid-cols-2 gap-6 pt-2 border-t border-gray-50">
              <div>
                <label className="block text-sm text-gray-600 mb-1">En stock</label>
                <input
                  type="number"
                  name="current_stock"
                  value={formData.current_stock || 0}
                  onChange={handleChange}
                  className="w-full border-b border-gray-300 focus:border-primary outline-none py-1 bg-transparent transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Inventario bajo</label>
                <input
                  type="number"
                  name="low_stock"
                  value={formData.low_stock || 0}
                  onChange={handleChange}
                  className="w-full border-b border-gray-300 focus:border-primary outline-none py-1 bg-transparent transition-colors"
                />
                <p className="text-xs text-gray-400 mt-1">Cantidad de artículos mínima para recibir notificación</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}