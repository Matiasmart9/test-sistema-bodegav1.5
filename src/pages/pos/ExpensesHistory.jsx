import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { collection, query, where, getDocs, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { TrendingDown, Calendar, Search, FileSpreadsheet, Loader2, User, XCircle, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function ExpensesHistory() {
  const { userData } = useAuth();
  
  // --- ESTADOS ---
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Filtro de Fechas
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0], // Hoy
    end: new Date().toISOString().split('T')[0]    // Hoy
  });

  // --- 1. CARGAR GASTOS (CORREGIDO) ---
  const fetchExpenses = async () => {
    setLoading(true);
    try {
        // 1. Construcción robusta de fechas (Igual que en SalesHistory)
        const [startYear, startMonth, startDay] = dateRange.start.split('-').map(Number);
        const [endYear, endMonth, endDay] = dateRange.end.split('-').map(Number);
        
        const startDate = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
        const endDate = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

        // 2. Consulta simplificada (Solo por fecha) para evitar error de Índice
        const q = query(
            collection(db, "shift_movements"), 
            where("date", ">=", startDate),
            where("date", "<=", endDate)
        );

        const snapshot = await getDocs(q);
        
        // 3. Filtrado en memoria (Solo gastos y no anulados visualmente aunque los traemos)
        const data = snapshot.docs
            .map(doc => ({
                id: doc.id,
                ...doc.data(),
                dateObj: doc.data().date?.toDate ? doc.data().date.toDate() : new Date(doc.data().date)
            }))
            .filter(item => item.type === 'expense'); // <--- AQUÍ FILTRAMOS QUE SEA GASTO

        // Ordenamos por fecha descendente (más nuevo primero)
        data.sort((a, b) => b.dateObj - a.dateObj);

        setExpenses(data);
        setCurrentPage(1); 
    } catch (error) {
        console.error("Error cargando gastos:", error);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [dateRange]); 

  // --- 2. ANULAR GASTO ---
  const handleCancelExpense = async (id, amount, reason) => {
      if(!window.confirm(`¿Seguro que deseas anular este gasto?\n"${reason}" de ₲ ${amount.toLocaleString()}`)) return;

      try {
          const expenseRef = doc(db, "shift_movements", id);
          await updateDoc(expenseRef, { 
              status: 'canceled',
              canceledBy: userData.name,
              canceledAt: new Date()
          });
          
          alert("Gasto anulado correctamente.");
          fetchExpenses(); 
      } catch (error) {
          console.error("Error al anular:", error);
          alert("No se pudo anular el gasto.");
      }
  };

  // --- 3. EXPORTAR EXCEL ---
  const handleExportExcel = () => {
      const dataToExport = filteredExpenses.map(item => ({
          'Fecha': item.dateObj.toLocaleDateString(),
          'Hora': item.dateObj.toLocaleTimeString(),
          'Usuario': item.user || 'Sistema',
          'Motivo / Descripción': item.reason,
          'Monto': item.amount,
          'Estado': item.status === 'canceled' ? 'ANULADO' : 'Activo'
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Gastos");
      XLSX.writeFile(wb, `Gastos_${dateRange.start}.xlsx`);
  };

  // --- LÓGICA DE FILTRADO Y PAGINACIÓN ---
  const filteredExpenses = expenses.filter(item => 
      item.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.user && item.user.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredExpenses.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredExpenses.length / itemsPerPage);

  // Calcular total visible (excluyendo anulados)
  const totalAmount = filteredExpenses
    .filter(e => e.status !== 'canceled')
    .reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

  return (
    <div className="max-w-6xl mx-auto pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-6 gap-4">
        <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <TrendingDown className="text-red-600"/> Historial de Gastos
            </h1>
            <p className="text-sm text-gray-500">Registro detallado de egresos y retiros de caja.</p>
        </div>

        {/* TARJETA DE TOTAL */}
        <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-center gap-4 shadow-sm min-w-[200px]">
            <div className="p-3 bg-white rounded-full text-red-500 shadow-sm"><TrendingDown size={24}/></div>
            <div>
                <p className="text-xs font-bold text-red-400 uppercase tracking-wider">Total Gastado</p>
                <p className="text-2xl font-black text-red-700">₲ {totalAmount.toLocaleString()}</p>
            </div>
        </div>
      </div>

      {/* BARRA DE HERRAMIENTAS */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-col lg:flex-row gap-4 justify-between items-center">
          
          {/* Rango de Fechas */}
          <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200 w-full lg:w-auto">
              <Calendar size={18} className="text-gray-400"/>
              <input type="date" value={dateRange.start} onChange={(e)=>setDateRange({...dateRange, start:e.target.value})} className="bg-transparent text-sm font-medium focus:outline-none text-gray-600"/>
              <span className="text-gray-400">-</span>
              <input type="date" value={dateRange.end} onChange={(e)=>setDateRange({...dateRange, end:e.target.value})} className="bg-transparent text-sm font-medium focus:outline-none text-gray-600"/>
          </div>

          {/* Buscador */}
          <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Buscar por motivo o usuario..." 
                value={searchTerm} 
                onChange={(e)=>setSearchTerm(e.target.value)} 
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:outline-none focus:border-red-400"
              />
          </div>

          {/* Botón Excel */}
          <button 
            onClick={handleExportExcel}
            disabled={filteredExpenses.length === 0}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 transition-colors shadow-sm whitespace-nowrap disabled:opacity-50"
          >
              <FileSpreadsheet size={18}/> Excel
          </button>
      </div>

      {/* TABLA DE GASTOS */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[300px]">
          {loading ? (
              <div className="flex flex-col items-center justify-center h-64 gap-2">
                  <Loader2 className="animate-spin text-red-500" size={40}/>
                  <p className="text-sm text-gray-400">Cargando gastos...</p>
              </div>
          ) : filteredExpenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-2">
                  <Filter size={40} className="opacity-20"/>
                  <p>No se encontraron gastos en este periodo.</p>
              </div>
          ) : (
              <div className="overflow-x-auto">
                  <table className="w-full text-left">
                      <thead className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                          <tr>
                              <th className="px-6 py-4">Fecha</th>
                              <th className="px-6 py-4">Usuario</th>
                              <th className="px-6 py-4">Motivo / Descripción</th>
                              <th className="px-6 py-4 text-right">Monto</th>
                              <th className="px-6 py-4 text-center">Acciones</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-sm">
                          {currentItems.map((item) => {
                              const isCanceled = item.status === 'canceled';
                              return (
                                  <tr key={item.id} className={`hover:bg-red-50/30 transition-colors ${isCanceled ? 'bg-gray-50 opacity-60' : ''}`}>
                                      <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                                          {item.dateObj.toLocaleDateString()} 
                                          <span className="text-xs text-gray-400 ml-2">{item.dateObj.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                      </td>
                                      <td className="px-6 py-4">
                                          <div className="flex items-center gap-2 text-gray-700 font-medium">
                                              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs">
                                                  <User size={12}/>
                                              </div>
                                              {item.user}
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-gray-800 font-medium">
                                          {item.reason}
                                          {isCanceled && <span className="ml-2 text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded border border-red-200 uppercase font-bold">Anulado</span>}
                                      </td>
                                      <td className={`px-6 py-4 text-right font-black text-base ${isCanceled ? 'text-gray-400 line-through' : 'text-red-600'}`}>
                                          - ₲ {parseFloat(item.amount).toLocaleString()}
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          {!isCanceled && (
                                              <button 
                                                  onClick={() => handleCancelExpense(item.id, item.amount, item.reason)}
                                                  className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
                                                  title="Anular Gasto"
                                              >
                                                  <XCircle size={18}/>
                                              </button>
                                          )}
                                      </td>
                                  </tr>
                              );
                          })}
                      </tbody>
                  </table>
              </div>
          )}

          {/* PAGINACIÓN */}
          {filteredExpenses.length > 0 && (
            <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
                <span className="text-xs text-gray-500">
                    Mostrando {indexOfFirstItem + 1} - {Math.min(indexOfLastItem, filteredExpenses.length)} de {filteredExpenses.length}
                </span>
                
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setCurrentPage(p => Math.max(p-1, 1))}
                        disabled={currentPage === 1}
                        className="p-2 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 transition-colors"
                    >
                        <ChevronLeft size={16}/>
                    </button>
                    <span className="text-xs font-bold text-gray-700 px-2">Página {currentPage} de {totalPages || 1}</span>
                    <button 
                        onClick={() => setCurrentPage(p => Math.min(p+1, totalPages))}
                        disabled={currentPage === totalPages || totalPages === 0}
                        className="p-2 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 transition-colors"
                    >
                        <ChevronRight size={16}/>
                    </button>
                </div>
            </div>
          )}
      </div>
    </div>
  );
}