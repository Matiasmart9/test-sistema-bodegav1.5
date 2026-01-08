import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

export default function DateRangeSelector({ onDateChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [label, setLabel] = useState('Hoy');
  
  // Fechas iniciales
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  const containerRef = useRef(null);

  // Cerrar al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleApply = () => {
    setLabel(`${formatDate(startDate)} - ${formatDate(endDate)}`);
    onDateChange(new Date(startDate), new Date(endDate));
    setIsOpen(false);
  };

  const formatDate = (dateStr) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  // Lógica de Presets (Hoy, Ayer, etc.)
  const selectPreset = (preset) => {
    const today = new Date();
    let start = new Date();
    let end = new Date();
    let newLabel = preset;

    switch (preset) {
      case 'Hoy':
        break; // start y end ya son hoy
      case 'Ayer':
        start.setDate(today.getDate() - 1);
        end.setDate(today.getDate() - 1);
        break;
      case 'Esta semana':
        // Lunes de esta semana
        const day = today.getDay() || 7; 
        if (day !== 1) start.setHours(-24 * (day - 1));
        break;
      case 'Última semana':
        start.setDate(today.getDate() - 7);
        break;
      case 'Este mes':
        start.setDate(1);
        break;
      case 'Último mes':
        start.setMonth(today.getMonth() - 1);
        start.setDate(1);
        end.setDate(0); // Último día del mes anterior
        break;
      default:
        break;
    }

    const sStr = start.toISOString().split('T')[0];
    const eStr = end.toISOString().split('T')[0];
    
    setStartDate(sStr);
    setEndDate(eStr);
    setLabel(newLabel);
    
    onDateChange(start, end);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* BARRA DE SELECCIÓN (HEADER) */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 bg-white border border-gray-200 px-4 py-2 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 text-gray-600">
            <ChevronLeft size={16} className="text-gray-400 hover:text-gray-600"/>
            <Calendar size={18} />
            <span className="font-medium text-sm">{label}</span>
            <ChevronRight size={16} className="text-gray-400 hover:text-gray-600"/>
        </div>
      </button>

      {/* MODAL DESPLEGABLE */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-xl z-50 flex flex-col md:flex-row overflow-hidden w-[600px] max-w-[90vw]">
            
            {/* LADO IZQUIERDO: SELECCIÓN MANUAL */}
            <div className="p-6 flex-1 border-r border-gray-100">
                <h4 className="font-bold text-gray-700 mb-4">Rango personalizado</h4>
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Fecha de inicio</label>
                        <input 
                            type="date" 
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full border rounded p-2 text-sm focus:outline-none focus:border-primary"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Fecha de finalización</label>
                        <input 
                            type="date" 
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full border rounded p-2 text-sm focus:outline-none focus:border-primary"
                        />
                    </div>
                </div>
                
                {/* Visualización simple de calendario (placeholder visual) */}
                <div className="bg-green-50 rounded-lg p-4 text-center text-sm text-green-800 border border-green-100">
                    <p>Seleccionado: <strong>{formatDate(startDate)}</strong> al <strong>{formatDate(endDate)}</strong></p>
                </div>

                <div className="mt-8 flex justify-end gap-2">
                    <button onClick={() => setIsOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded text-sm font-medium">CANCELAR</button>
                    <button onClick={handleApply} className="px-4 py-2 bg-primary text-white rounded text-sm font-medium hover:bg-green-600">HECHO</button>
                </div>
            </div>

            {/* LADO DERECHO: PRESETS */}
            <div className="w-48 bg-gray-50 p-2 flex flex-col gap-1 overflow-y-auto max-h-[400px]">
                {['Hoy', 'Ayer', 'Esta semana', 'Última semana', 'Este mes', 'Último mes'].map(preset => (
                    <button 
                        key={preset}
                        onClick={() => selectPreset(preset)}
                        className={`text-left px-4 py-2 rounded text-sm transition-colors ${label === preset ? 'bg-primary/10 text-primary font-bold' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        {preset}
                    </button>
                ))}
            </div>
        </div>
      )}
    </div>
  );
}