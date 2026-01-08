import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { db } from '../../firebase/config';
import { History, Search, ArrowLeft, ArrowRight, Calendar, User, FileText, Filter } from 'lucide-react';

export default function InventoryHistoryGlobal() {
  const [allLogs, setAllLogs] = useState([]); // Todos los registros cargados
  const [filteredLogs, setFilteredLogs] = useState([]); // Registros filtrados
  const [loading, setLoading] = useState(true);
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  // 1. CARGAR DATOS
  useEffect(() => {
    const fetchGlobalHistory = async () => {
      setLoading(true);
      try {
        // Traemos los logs ordenados por fecha descendente (lo más nuevo arriba)
        const q = query(collection(db, "inventory_logs"), orderBy("date", "desc"));
        const querySnapshot = await getDocs(q);
        
        const logsData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          // Normalizar fecha
          dateObj: doc.data().date?.toDate ? doc.data().date.toDate() : new Date(doc.data().date)
        }));

        setAllLogs(logsData);
        setFilteredLogs(logsData); // Inicialmente mostramos todo
      } catch (error) {
        console.error("Error cargando historial global:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchGlobalHistory();
  }, []);

  // 2. APLICAR FILTROS
  useEffect(() => {
    let result = allLogs;

    // Filtro Texto (Busca en Variante, Usuario o Motivo)
    if (searchTerm) {
        const lowerSearch = searchTerm.toLowerCase();
        result = result.filter(log => 
            (log.variantName || '').toLowerCase().includes(lowerSearch) ||
            (log.user || '').toLowerCase().includes(lowerSearch) ||
            (log.reason || '').toLowerCase().includes(lowerSearch)
        );
    }

    // Filtro Fecha Inicio
    if (dateStart) {
        const start = new Date(dateStart);
        start.setHours(0,0,0,0);
        result = result.filter(log => log.dateObj >= start);
    }

    // Filtro Fecha Fin
    if (dateEnd) {
        const end = new Date(dateEnd);
        end.setHours(23,59,59,999);
        result = result.filter(log => log.dateObj <= end);
    }

    setFilteredLogs(result);
    setCurrentPage(1); // Volver a pag 1 al filtrar
  }, [searchTerm, dateStart, dateEnd, allLogs]);

  // 3. LÓGICA DE PAGINACIÓN
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredLogs.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);

  // Formateador de Fecha
  const formatDate = (date) => {
    return new Intl.DateTimeFormat('es-PY', { 
      day: '2-digit', month: '2-digit', year: 'numeric', 
      hour: '2-digit', minute: '2-digit' 
    }).format(date);
  };

  if (loading) return <div className="p-10 text-center text-gray-500">Cargando historial completo...</div>;

  return (
    <div className="max-w-7xl mx-auto pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-6 gap-4">
        <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <History className="text-primary"/> Historial de Inventario Global
            </h1>
            <p className="text-sm text-gray-500 mt-1">
                Registro centralizado de todos los movimientos (Cargas, Ventas, Ajustes, Pérdidas).
            </p>
        </div>
        
        {/* BARRA DE FILTROS */}
        <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-lg shadow-sm border border-gray-200">
            <div className="relative">
                <Search size={18} className="absolute left-3 top-2.5 text-gray-400"/>
                <input 
                    type="text" 
                    placeholder="Buscar producto, usuario..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary w-64"
                />
            </div>
            
            <div className="flex items-center gap-2 px-2 border-l border-gray-200">
                <Calendar size={18} className="text-gray-400"/>
                <input 
                    type="date" 
                    value={dateStart}
                    onChange={(e) => setDateStart(e.target.value)}
                    className="text-sm bg-transparent focus:outline-none text-gray-600"
                />
                <span className="text-gray-400">-</span>
                <input 
                    type="date" 
                    value={dateEnd}
                    onChange={(e) => setDateEnd(e.target.value)}
                    className="text-sm bg-transparent focus:outline-none text-gray-600"
                />
            </div>
        </div>
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-600 font-bold border-b border-gray-200 text-xs uppercase">
                    <tr>
                        <th className="px-6 py-4">Fecha</th>
                        <th className="px-6 py-4">Producto / Variante</th>
                        <th className="px-6 py-4">Empleado</th>
                        <th className="px-6 py-4">Motivo</th>
                        <th className="px-6 py-4 text-right">Ajuste</th>
                        <th className="px-6 py-4 text-right">Stock Final</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {currentItems.length === 0 ? (
                        <tr><td colSpan="6" className="p-8 text-center text-gray-400">No se encontraron registros</td></tr>
                    ) : (
                        currentItems.map((log) => (
                            <tr key={log.id} className="hover:bg-blue-50/30 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                                    {formatDate(log.dateObj)}
                                </td>
                                <td className="px-6 py-4 font-bold text-gray-800">
                                    {log.variantName}
                                    {log.note && (
                                        <div className="text-[10px] font-normal text-gray-500 italic mt-0.5 flex items-center gap-1">
                                            <FileText size={10}/> {log.note}
                                        </div>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-gray-600 flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                                        <User size={12}/>
                                    </div>
                                    {log.user}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold border ${
                                        log.reason === 'Venta' ? 'bg-green-50 text-green-700 border-green-100' :
                                        log.reason.includes('Pérdida') ? 'bg-red-50 text-red-700 border-red-100' :
                                        'bg-gray-50 text-gray-700 border-gray-200'
                                    }`}>
                                        {log.reason}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <span className={`font-bold ${log.change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {log.change > 0 ? '+' : ''}{log.change}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right font-medium text-gray-700">
                                    {log.finalStock}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
        
        {/* PAGINACIÓN */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
            <span className="text-xs text-gray-500">
                Mostrando {filteredLogs.length === 0 ? 0 : indexOfFirstItem + 1} - {Math.min(indexOfLastItem, filteredLogs.length)} de {filteredLogs.length} registros
            </span>
            
            <div className="flex items-center gap-2">
                <button 
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-2 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ArrowLeft size={16}/>
                </button>
                
                {/* Números de página simples */}
                <span className="text-sm font-bold text-gray-700 px-2">
                    Página {currentPage} de {totalPages || 1}
                </span>

                <button 
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className="p-2 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ArrowRight size={16}/>
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}