import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { collection, query, where, getDocs, orderBy, doc, updateDoc, increment, getDoc, addDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Receipt, ArrowUpRight, Banknote, Smartphone, CreditCard, Loader2, Printer, Search, User, FileSpreadsheet, Calendar, TrendingUp, Ban, AlertTriangle, TrendingDown, Plus, X, Info, DollarSign } from 'lucide-react';
import TicketInvoice from './TicketInvoice';
import * as XLSX from 'xlsx';

export default function SalesHistory() {
  const { userData } = useAuth();
  
  // --- ESTADOS DE DATOS ---
  const [mergedHistory, setMergedHistory] = useState([]); // Ventas + Gastos combinados
  const [globalBalance, setGlobalBalance] = useState(0); // Balance histórico total
  const [loading, setLoading] = useState(true);
  const [loadingGlobal, setLoadingGlobal] = useState(true);
  
  // --- ESTADOS DE INTERFAZ ---
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [searchTerm, setSearchTerm] = useState(''); 
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  // --- MODALES ---
  const [selectedSale, setSelectedSale] = useState(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseData, setExpenseData] = useState({ amount: '', reason: '' });

  // 1. CARGA DE DATOS FILTRADOS (RANGO DE FECHAS)
  const fetchData = async () => {
    if (!userData) return;
    setLoading(true);

    try {
        const [startYear, startMonth, startDay] = dateRange.start.split('-').map(Number);
        const [endYear, endMonth, endDay] = dateRange.end.split('-').map(Number);
        const startDate = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
        const endDate = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

        // A. Consultar Ventas
        let salesQuery = query(collection(db, "sales"), where("date", ">=", startDate), where("date", "<=", endDate));
        if (userData.role !== 'admin') {
            salesQuery = query(collection(db, "sales"), where("userId", "==", userData.id), where("date", ">=", startDate), where("date", "<=", endDate));
        }
        const salesSnap = await getDocs(salesQuery);
        const salesData = salesSnap.docs.map(doc => ({ 
            id: doc.id, 
            type: 'sale', 
            ...doc.data(), 
            date: doc.data().date?.toDate() || new Date(doc.data().date) 
        }));

        // B. Consultar Gastos
        let expensesQuery = query(collection(db, "shift_movements"), where("date", ">=", startDate), where("date", "<=", endDate));
        // Nota: Los gastos suelen ser visibles para admin, o filtrados por usuario si se requiere
        const expensesSnap = await getDocs(expensesQuery);
        const expensesData = expensesSnap.docs.map(doc => ({
            id: doc.id,
            type: 'expense', 
            ...doc.data(),
            date: doc.data().date?.toDate() || new Date(doc.data().date)
        }));

        // C. Combinar y Ordenar
        const combined = [...salesData, ...expensesData];
        combined.sort((a, b) => b.date - a.date);

        setMergedHistory(combined);
        
    } catch (error) {
        console.error("Error cargando datos:", error);
    } finally {
        setLoading(false);
    }
  };

  // 2. CARGA DE BALANCE GLOBAL (SIN FILTROS DE FECHA)
  // Nota: Esto puede ser pesado si hay muchos datos. Idealmente usar contadores en un documento separado.
  const fetchGlobalBalance = async () => {
      if (userData.role !== 'admin') return; // Solo admin ve el global
      setLoadingGlobal(true);
      try {
          // Traemos todo para calcular el "Caja Histórica"
          // Optimización futura: Usar un documento de 'aggregations'
          const salesSnap = await getDocs(collection(db, "sales"));
          const expensesSnap = await getDocs(collection(db, "shift_movements"));

          const totalSales = salesSnap.docs.reduce((acc, doc) => {
              const d = doc.data();
              return d.status !== 'canceled' ? acc + (d.total || 0) : acc;
          }, 0);

          const totalExpenses = expensesSnap.docs.reduce((acc, doc) => {
              const d = doc.data();
              return (d.type === 'expense' && d.status !== 'canceled') ? acc + (d.amount || 0) : acc;
          }, 0);

          setGlobalBalance(totalSales - totalExpenses);
      } catch (e) {
          console.error("Error balance global", e);
      } finally {
          setLoadingGlobal(false);
      }
  };

  useEffect(() => {
    fetchData();
  }, [userData, dateRange]);

  useEffect(() => {
      fetchGlobalBalance();
  }, [userData]); // Solo al cargar el componente

  // --- FILTROS DE BÚSQUEDA LOCAL ---
  const filteredHistory = mergedHistory.filter(item => {
      const term = searchTerm.toLowerCase();
      if (item.type === 'sale') {
          return (item.ticketId || '').toLowerCase().includes(term);
      } else {
          return (item.reason || '').toLowerCase().includes(term);
      }
  });

  // --- ACCIONES ---

  const handleAddExpenseAdmin = async () => {
      if(!expenseData.amount || !expenseData.reason) return alert("Complete los datos");
      try {
          await addDoc(collection(db, "shift_movements"), {
              shiftId: 'ADMIN_ENTRY', 
              type: 'expense',
              amount: parseFloat(expenseData.amount),
              reason: expenseData.reason + " (Admin)",
              date: new Date(),
              user: userData.name,
              status: 'active' // Estado por defecto
          });
          alert("Gasto registrado");
          setShowExpenseModal(false);
          setExpenseData({ amount: '', reason: '' });
          fetchData(); 
          fetchGlobalBalance();
      } catch (e) { console.error(e); alert("Error"); }
  };

  const handleCancelSale = async (sale) => {
      if (!window.confirm(`¿⚠️ ESTÁ SEGURO?\n\nVa a anular el Ticket #${sale.ticketId}.`)) return;
      setLoading(true);
      try {
          for (const item of sale.items) {
              let prodRef = doc(db, "products", item.id);
              await updateDoc(prodRef, { current_stock: increment(parseFloat(item.quantity)) }).catch(()=>{});
          }
          await updateDoc(doc(db, "sales", sale.id), { status: 'canceled', canceledAt: new Date(), canceledBy: userData.name });
          fetchData();
          fetchGlobalBalance();
          alert("Ticket anulado.");
      } catch (error) { console.error(error); alert("Error al anular."); } finally { setLoading(false); }
  };

  // NUEVO: ANULAR GASTO
  const handleCancelExpense = async (expense) => {
      if (!window.confirm(`¿Anular este gasto de ₲ ${expense.amount.toLocaleString()}?\n\nEl dinero volverá al balance.`)) return;
      setLoading(true);
      try {
          await updateDoc(doc(db, "shift_movements", expense.id), { 
              status: 'canceled', 
              canceledAt: new Date(), 
              canceledBy: userData.name 
          });
          fetchData();
          fetchGlobalBalance();
          alert("Gasto anulado.");
      } catch (error) { console.error(error); alert("Error al anular gasto."); } finally { setLoading(false); }
  };

  // --- CÁLCULOS DE KPIS (SEGÚN RANGO DE FECHA) ---
  const activeSales = filteredHistory.filter(i => i.type === 'sale' && i.status !== 'canceled');
  const activeExpenses = filteredHistory.filter(i => i.type === 'expense' && i.status !== 'canceled');

  // 1. Ventas Brutas (Antes de descuento)
  const grossSales = activeSales.reduce((acc, s) => acc + (s.subTotal || s.total || 0), 0);
  
  // 2. Descuentos
  const totalDiscounts = activeSales.reduce((acc, s) => acc + (s.discountTotal || 0), 0);
  
  // 3. Ventas Netas (Lo que entró realmente)
  const netSales = activeSales.reduce((acc, s) => acc + (s.total || 0), 0);
  
  // 4. Costo de Bienes (COGS)
  const totalCost = activeSales.reduce((acc, sale) => {
      const saleCost = sale.items?.reduce((iAcc, item) => iAcc + ((item.cost||0) * (item.quantity||0)), 0) || 0;
      return acc + saleCost;
  }, 0);

  // 5. Beneficio Bruto (Ventas Netas - Costo)
  const grossProfit = netSales - totalCost;

  // 6. Egresos
  const totalExpenses = activeExpenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);


  // --- EXCEL ---
  const handleExportExcel = () => {
    const dataToExport = filteredHistory.map(item => {
        if (item.type === 'sale') {
            return {
                'Tipo': 'VENTA',
                'Ref': item.ticketId,
                'Fecha': item.date.toLocaleDateString() + ' ' + item.date.toLocaleTimeString(),
                'Usuario': item.userName,
                'Detalle': item.appliedDiscounts?.length > 0 ? 'Con Descuentos' : 'Normal',
                'Subtotal': item.subTotal || item.total,
                'Descuento': item.discountTotal || 0,
                'Total Neto': item.status === 'canceled' ? 0 : item.total,
                'Estado': item.status === 'canceled' ? 'ANULADO' : 'OK'
            };
        } else {
            return {
                'Tipo': 'GASTO',
                'Ref': '-',
                'Fecha': item.date.toLocaleDateString() + ' ' + item.date.toLocaleTimeString(),
                'Usuario': item.user,
                'Detalle': item.reason,
                'Subtotal': 0,
                'Descuento': 0,
                'Total Neto': item.status === 'canceled' ? 0 : (item.amount * -1),
                'Estado': item.status === 'canceled' ? 'ANULADO' : 'OK'
            };
        }
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte");
    XLSX.writeFile(wb, `Reporte_Bodega_${dateRange.start}.xlsx`);
  };

  // --- HELPERS VISUALES ---
  const getMethodName = (m) => ({ cash: 'Efectivo', qr: 'QR', transfer: 'Transferencia' }[m] || 'Otro');
  
  // COMPONENTE DE TARJETA KPI CON TOOLTIP
  const KpiCard = ({ title, value, colorClass, icon: Icon, tooltip }) => (
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm relative group hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-2">
              <p className="text-xs text-gray-500 font-bold uppercase flex items-center gap-1">
                  {title}
                  <div className="relative inline-block">
                      <Info size={14} className="text-gray-300 cursor-help hover:text-gray-500"/>
                      {/* Tooltip */}
                      <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity absolute left-0 bottom-full mb-2 w-48 bg-gray-800 text-white text-[10px] p-2 rounded shadow-lg z-10 pointer-events-none normal-case font-normal leading-tight">
                          {tooltip}
                          <div className="absolute top-full left-2 -mt-1 border-4 border-transparent border-t-gray-800"></div>
                      </div>
                  </div>
              </p>
              {Icon && <Icon size={18} className={colorClass.replace('text-', 'text-opacity-50 text-')} />}
          </div>
          <h3 className={`text-2xl font-black ${colorClass}`}>
              {typeof value === 'number' ? `₲ ${value.toLocaleString()}` : value}
          </h3>
      </div>
  );

  // PAGINACIÓN
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredHistory.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);

  if (!userData) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary"/></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto pb-20">
        
        {/* MODAL GASTO */}
        {showExpenseModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
                    <h3 className="font-bold mb-4">Registrar Gasto (Admin)</h3>
                    <div className="space-y-3">
                        <input type="number" className="w-full border p-2 rounded" placeholder="Monto" value={expenseData.amount} onChange={e=>setExpenseData({...expenseData, amount:e.target.value})}/>
                        <input type="text" className="w-full border p-2 rounded" placeholder="Motivo" value={expenseData.reason} onChange={e=>setExpenseData({...expenseData, reason:e.target.value})}/>
                        <div className="flex gap-2">
                            <button onClick={()=>setShowExpenseModal(false)} className="flex-1 border p-2 rounded">Cancelar</button>
                            <button onClick={handleAddExpenseAdmin} className="flex-1 bg-red-600 text-white p-2 rounded font-bold">Guardar</button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* HEADER Y BALANCE GLOBAL */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-8 gap-4">
            <div>
                <h1 className="text-2xl font-bold text-gray-800">Movimientos y Ventas</h1>
                <p className="text-sm text-gray-500">Vista Gerencial Unificada</p>
            </div>

            {/* TARJETA DE BALANCE GLOBAL (SIN FILTROS) */}
            {userData.role === 'admin' && (
                <div className="bg-gray-900 text-white p-4 rounded-xl shadow-lg flex items-center gap-4 min-w-[250px]">
                    <div className="p-3 bg-white/10 rounded-full">
                        <DollarSign size={24} className="text-green-400"/>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Capital Total Acumulado</p>
                        {loadingGlobal ? (
                            <Loader2 size={16} className="animate-spin mt-1"/>
                        ) : (
                            <p className="text-2xl font-black text-white">₲ {globalBalance.toLocaleString()}</p>
                        )}
                        <p className="text-[10px] text-gray-500">Histórico (Ventas - Gastos)</p>
                    </div>
                </div>
            )}
        </div>

        {/* BARRA DE ACCIONES Y FILTROS */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-col xl:flex-row gap-4 justify-between items-center">
            
            {/* BOTONES DE FECHA RÁPIDA */}
            <div className="flex gap-2 overflow-x-auto pb-2 xl:pb-0 w-full xl:w-auto no-scrollbar">
                {[{label:'Hoy',val:'today'}, {label:'Ayer',val:'yesterday'}, {label:'Esta Semana',val:'last7'}, {label:'Este Mes',val:'month'}].map(btn => (
                    <button key={btn.val} onClick={() => {
                        const today = new Date();
                        let start = new Date(); let end = new Date();
                        if (btn.val === 'yesterday') { start.setDate(today.getDate() - 1); end.setDate(today.getDate() - 1); }
                        else if (btn.val === 'last7') { start.setDate(today.getDate() - 7); }
                        else if (btn.val === 'month') { start = new Date(today.getFullYear(), today.getMonth(), 1); end = new Date(today.getFullYear(), today.getMonth() + 1, 0); }
                        const fmt = (d) => { const off = d.getTimezoneOffset()*60000; return new Date(d.getTime()-off).toISOString().split('T')[0]; };
                        setDateRange({ start: fmt(start), end: fmt(end) });
                    }} className="px-4 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full whitespace-nowrap transition-colors">
                        {btn.label}
                    </button>
                ))}
            </div>

            {/* SELECTOR DE FECHAS */}
            <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200">
                <Calendar size={16} className="text-gray-400"/>
                <input type="date" value={dateRange.start} onChange={(e)=>setDateRange({...dateRange, start:e.target.value})} className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none"/>
                <span className="text-gray-400">-</span>
                <input type="date" value={dateRange.end} onChange={(e)=>setDateRange({...dateRange, end:e.target.value})} className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none"/>
            </div>

            {/* BUSCADOR Y BOTONES */}
            <div className="flex gap-2 w-full xl:w-auto">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                    <input type="text" placeholder="Buscar..." value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:outline-none focus:border-primary"/>
                </div>
                {userData.role === 'admin' && (
                    <button onClick={() => setShowExpenseModal(true)} className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg font-bold hover:bg-red-100 transition-colors flex items-center gap-2 whitespace-nowrap">
                        <TrendingDown size={18}/> <span className="hidden sm:inline">Gasto</span>
                    </button>
                )}
                <button onClick={handleExportExcel} className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 transition-colors flex items-center gap-2 whitespace-nowrap">
                    <FileSpreadsheet size={18}/> <span className="hidden sm:inline">Excel</span>
                </button>
            </div>
        </div>

        {/* --- GRID DE KPIS (5 TARJETAS) --- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <KpiCard 
                title="Ventas Brutas" 
                value={grossSales} 
                colorClass="text-gray-800" 
                tooltip="La suma de todas las ventas antes de los descuentos y reembolsos."
            />
            <KpiCard 
                title="Descuentos" 
                value={totalDiscounts} 
                colorClass="text-orange-500" 
                tooltip="La suma de los descuentos en los recibos de ventas."
            />
            <KpiCard 
                title="Ventas Netas" 
                value={netSales} 
                colorClass="text-blue-600" 
                tooltip="Ventas brutas menos descuentos y reembolsos."
            />
            <KpiCard 
                title="Beneficio Bruto" 
                value={grossProfit} 
                colorClass="text-green-600" 
                tooltip="Ventas netas menos costo de bienes (Ganancia Real)."
                icon={TrendingUp}
            />
            <KpiCard 
                title="Egresos (Gastos)" 
                value={totalExpenses} 
                colorClass="text-red-500" 
                tooltip="Total de gastos operativos registrados en este periodo."
                icon={TrendingDown}
            />
        </div>

        {/* TABLA DETALLADA */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-[400px]">
            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" size={40}/></div>
            ) : filteredHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3"><Search size={30}/><p>No hay movimientos en este rango.</p></div>
            ) : (
                <>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b text-gray-500 text-xs uppercase font-bold">
                            <tr>
                                <th className="px-6 py-4">Ref / Ticket</th>
                                <th className="px-6 py-4">Fecha</th>
                                <th className="px-6 py-4">Usuario</th>
                                <th className="px-6 py-4">Detalle / Items</th>
                                <th className="px-6 py-4 text-right">Monto</th>
                                {userData.role === 'admin' && <th className="px-6 py-4 text-center">Acciones</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                            {currentItems.map((item) => {
                                const isExpense = item.type === 'expense';
                                const isCanceled = item.status === 'canceled';
                                
                                return (
                                <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${isCanceled ? 'bg-gray-50 opacity-60' : ''}`}>
                                    
                                    {/* TICKET / REF */}
                                    <td className="px-6 py-4 font-mono font-bold text-gray-600">
                                        {isExpense ? (
                                            <span className="flex items-center gap-2 text-red-500"><TrendingDown size={14}/> GASTO</span>
                                        ) : (
                                            <span className="flex items-center gap-2 text-green-600"><Receipt size={14}/> {item.ticketId}</span>
                                        )}
                                    </td>

                                    {/* FECHA */}
                                    <td className="px-6 py-4 text-gray-600">
                                        {item.date.toLocaleDateString()} <span className="text-gray-400 text-xs ml-1">{item.date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                    </td>

                                    {/* USUARIO */}
                                    <td className="px-6 py-4 text-gray-700">
                                        <div className="flex items-center gap-2"><User size={14} className="text-gray-400"/> {item.userName || item.user}</div>
                                    </td>

                                    {/* DETALLE */}
                                    <td className="px-6 py-4 text-gray-600">
                                        {isExpense ? (
                                            <span className={`italic ${isCanceled ? 'line-through' : ''}`}>{item.reason} {isCanceled && '(ANULADO)'}</span>
                                        ) : (
                                            <div className="flex flex-col">
                                                <span className={isCanceled ? 'line-through' : ''}>{getMethodName(item.paymentMethod)}</span>
                                                {item.appliedDiscounts?.length > 0 && (
                                                    <span className="text-[10px] text-orange-500 font-bold flex items-center gap-1">
                                                        <AlertTriangle size={10}/> Desc. Aplicado
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </td>

                                    {/* MONTO */}
                                    <td className={`px-6 py-4 text-right font-black text-base ${isCanceled ? 'line-through text-gray-400' : isExpense ? 'text-red-500' : 'text-gray-800'}`}>
                                        {isExpense ? '-' : '+'} ₲ {parseFloat(isExpense ? item.amount : item.total).toLocaleString()}
                                    </td>

                                    {/* ACCIONES */}
                                    {userData.role === 'admin' && (
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex justify-center gap-2">
                                                {!isExpense && !isCanceled && (
                                                    <button onClick={() => setSelectedSale(item)} className="text-blue-500 hover:bg-blue-50 p-2 rounded transition-colors" title="Ver Ticket">
                                                        <Printer size={18}/>
                                                    </button>
                                                )}
                                                
                                                {!isCanceled && (
                                                    <button 
                                                        onClick={() => isExpense ? handleCancelExpense(item) : handleCancelSale(item)} 
                                                        className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded transition-colors"
                                                        title={isExpense ? "Anular Gasto" : "Anular Venta"}
                                                    >
                                                        <Ban size={18}/>
                                                    </button>
                                                )}

                                                {isCanceled && <span className="text-xs font-bold text-red-300 border border-red-200 px-2 py-1 rounded">ANULADO</span>}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </div>
                {/* PAGINACIÓN */}
                <div className="border-t p-4 flex justify-between items-center bg-gray-50">
                    <button onClick={() => setCurrentPage(p => Math.max(p-1,1))} disabled={currentPage===1} className="px-4 py-2 bg-white border rounded text-sm hover:bg-gray-100 disabled:opacity-50">Anterior</button>
                    <span className="text-sm text-gray-500">Página {currentPage} de {totalPages}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(p+1,totalPages))} disabled={currentPage===totalPages} className="px-4 py-2 bg-white border rounded text-sm hover:bg-gray-100 disabled:opacity-50">Siguiente</button>
                </div>
                </>
            )}
        </div>

        {/* MODAL TICKET */}
        {selectedSale && (
            <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden">
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                        <h3 className="font-bold">Ticket #{selectedSale.ticketId}</h3>
                        <button onClick={() => setSelectedSale(null)} className="text-xl">×</button>
                    </div>
                    <div className="flex-1 overflow-y-auto bg-gray-200 p-4 flex justify-center">
                        <div className="bg-white shadow-xl w-[300px]">
                            <TicketInvoice 
                                cart={selectedSale.items} 
                                total={selectedSale.total} 
                                amountPaid={selectedSale.amountReceived} 
                                change={selectedSale.change} 
                                paymentMethod={selectedSale.paymentMethod} 
                                ticketId={selectedSale.ticketId} 
                                date={selectedSale.date} 
                                client={selectedSale.client} 
                                cashierName={selectedSale.userName}
                                copyLabel="COPIA: ADMIN"
                                subTotal={selectedSale.subTotal} 
                                discountTotal={selectedSale.discountTotal}
                                appliedDiscounts={selectedSale.appliedDiscounts}
                            />
                        </div>
                    </div>
                    <div className="p-4 bg-white border-t flex gap-2">
                         <button onClick={() => window.print()} className="flex-1 bg-black text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2"><Printer size={18}/> IMPRIMIR</button>
                    </div>
                </div>
            </div>
        )}
        
        {/* IMPRESIÓN OCULTA */}
        {selectedSale && (
            <div id="printable-ticket" className="hidden print:block">
                <TicketInvoice 
                    cart={selectedSale.items} 
                    total={selectedSale.total} 
                    amountPaid={selectedSale.amountReceived} 
                    change={selectedSale.change} 
                    paymentMethod={selectedSale.paymentMethod} 
                    ticketId={selectedSale.ticketId} 
                    date={selectedSale.date} 
                    client={selectedSale.client} 
                    cashierName={selectedSale.userName}
                    subTotal={selectedSale.subTotal} 
                    discountTotal={selectedSale.discountTotal}
                    appliedDiscounts={selectedSale.appliedDiscounts}
                />
            </div>
        )}
    </div>
  );
}