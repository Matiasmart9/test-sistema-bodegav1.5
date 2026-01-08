import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Calendar, Search } from 'lucide-react';
import { collection, query, getDocs, orderBy } from 'firebase/firestore'; 
import { db } from '../../firebase/config';

export default function WorkHoursList() {
  // Filtros de fecha (por defecto HOY)
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);

  // 1. CARGAR TODOS LOS TURNOS
  useEffect(() => {
    const fetchShifts = async () => {
      setLoading(true);
      try {
        // Traemos ordenado por fecha de apertura descendente
        const q = query(collection(db, "shifts"), orderBy("openTime", "desc")); 
        const snapshot = await getDocs(q);
        
        const shiftsData = snapshot.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                ...d,
                openDate: d.openTime?.toDate ? d.openTime.toDate() : new Date(d.openTime),
                closeDate: d.closeTime?.toDate ? d.closeTime.toDate() : null
            };
        });
        setShifts(shiftsData);
      } catch (error) {
        console.error("Error cargando turnos:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchShifts();
  }, []);

  // 2. FILTRAR Y CALCULAR DATOS
  const filteredShifts = shifts.filter(shift => {
    if (!shift.openDate) return false;
    
    // Configurar fechas filtro (Inicio 00:00 - Fin 23:59)
    const start = new Date(dateRange.start); start.setHours(0,0,0,0);
    const end = new Date(dateRange.end); end.setHours(23,59,59,999);
    
    // Comparar fecha de APERTURA con el rango
    return shift.openDate >= start && shift.openDate <= end;
  }).map(shift => {
      // CALCULAR DURACIÓN (HS TRAB.)
      let hoursWorked = "En curso";
      let diffMs = 0;

      if (shift.closeDate) {
          diffMs = shift.closeDate - shift.openDate;
          const hours = Math.floor(diffMs / (1000 * 60 * 60));
          const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          hoursWorked = `${hours}h ${minutes}m`;
      }

      // CALCULAR CAJA FINAL (Base + Ventas)
      const finalCash = (shift.startingCash || 0) + (shift.salesTotal || 0);

      return {
          ...shift,
          hoursWorked, // Dato calculado
          finalCash    // Dato calculado
      };
  });

  // 3. EXPORTAR A EXCEL
  const exportExcel = () => {
    const dataToExport = filteredShifts.map(s => ({
      'Empleado': s.userName,
      'Apertura': s.openDate.toLocaleString(),
      'Cierre': s.closeDate ? s.closeDate.toLocaleString() : 'En curso',
      'Caja Inicial': s.startingCash,
      'Caja Final (Est.)': s.finalCash,
      'Estado': s.status === 'open' ? 'ABIERTO' : 'CERRADO',
      'Hs Trab.': s.hoursWorked
    }));
    
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Horas Trabajadas");
    XLSX.writeFile(wb, `Horas_Trabajadas_${dateRange.start}.xlsx`);
  };

  return (
    <div className="max-w-7xl mx-auto pb-20">
      
      {/* HEADER */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Horas Trabajadas</h1>
        <p className="text-gray-500 text-sm mt-1">Registro detallado de aperturas, cierres y duración de turnos.</p>
      </div>

      {/* BARRA DE HERRAMIENTAS */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
        
        {/* SELECTOR DE FECHAS */}
        <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200">
            <Calendar size={18} className="text-gray-400"/>
            <input 
                type="date" 
                value={dateRange.start}
                onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none"
            />
            <span className="text-gray-400">-</span>
            <input 
                type="date" 
                value={dateRange.end}
                onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none"
            />
        </div>
        
        <button 
            onClick={exportExcel}
            disabled={filteredShifts.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <FileSpreadsheet size={18} />
            Exportar Excel
        </button>
      </div>

      {/* TABLA DE TURNOS */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
             <div className="text-center py-12 text-gray-400">Cargando datos...</div>
        ) : filteredShifts.length === 0 ? (
            <div className="text-center py-16">
                <p className="text-gray-400">No hay registros para las fechas seleccionadas.</p>
            </div>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold border-b border-gray-100">
                    <tr>
                    <th className="px-6 py-4">Empleado</th>
                    <th className="px-6 py-4">Apertura</th>
                    <th className="px-6 py-4">Cierre</th>
                    <th className="px-6 py-4 text-right">Inicial</th>
                    <th className="px-6 py-4 text-right">Caja Final</th>
                    <th className="px-6 py-4 text-center">Estado</th>
                    <th className="px-6 py-4 text-center bg-blue-50 text-blue-700">Hs Trab.</th> {/* COLUMNA SOLICITADA */}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {filteredShifts.map((shift) => (
                    <tr key={shift.id} className="hover:bg-gray-50 transition-colors">
                        
                        {/* EMPLEADO */}
                        <td className="px-6 py-4">
                            <div className="font-bold text-gray-800">{shift.userName}</div>
                            <div className="text-[10px] text-gray-400 uppercase">{shift.userRole}</div>
                        </td>
                        
                        {/* APERTURA */}
                        <td className="px-6 py-4 text-gray-600">
                            {shift.openDate.toLocaleDateString()} <br/>
                            <span className="text-xs font-bold">{shift.openDate.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                        </td>
                        
                        {/* CIERRE */}
                        <td className="px-6 py-4 text-gray-600">
                            {shift.closeDate ? (
                                <>
                                    {shift.closeDate.toLocaleDateString()} <br/>
                                    <span className="text-xs font-bold">{shift.closeDate.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                </>
                            ) : (
                                <span className="text-xs italic text-gray-400">---</span>
                            )}
                        </td>
                        
                        {/* INICIAL */}
                        <td className="px-6 py-4 text-right font-mono text-gray-600">
                            ₲ {shift.startingCash.toLocaleString()}
                        </td>
                        
                        {/* CAJA FINAL */}
                        <td className="px-6 py-4 text-right font-mono font-bold text-gray-800">
                             ₲ {shift.finalCash.toLocaleString()}
                        </td>

                        {/* ESTADO */}
                        <td className="px-6 py-4 text-center">
                             {shift.status === 'open' ? (
                                 <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold border border-green-200">ABIERTO</span>
                             ) : (
                                 <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-bold border border-gray-200">CERRADO</span>
                             )}
                        </td>

                        {/* HS TRAB (DURACIÓN) */}
                        <td className="px-6 py-4 text-center font-bold text-blue-600 bg-blue-50/30">
                            {shift.hoursWorked}
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
        )}
      </div>
    </div>
  );
}