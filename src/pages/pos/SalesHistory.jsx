import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  collection, query, where, getDocs, doc,
  updateDoc, increment, addDoc,
  getAggregateFromServer, sum
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  Receipt, Loader2, Printer, Search, User,
  FileSpreadsheet, Calendar, TrendingUp, Ban,
  AlertTriangle, TrendingDown, X, Info, DollarSign
} from 'lucide-react';
import TicketInvoice from './TicketInvoice';
import * as XLSX from 'xlsx';
import { toast } from '../../components/ui/Toast';

export default function SalesHistory() {
  const { userData } = useAuth();

  // ── Datos ─────────────────────────────────────────────────────────────────
  const [mergedHistory,  setMergedHistory]  = useState([]);
  const [globalBalance,  setGlobalBalance]  = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [loadingGlobal,  setLoadingGlobal]  = useState(false);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [currentPage,      setCurrentPage]      = useState(1);
  const itemsPerPage = 20;
  const [searchTerm,       setSearchTerm]       = useState('');
  const [dateRange,        setDateRange]        = useState({
    start: new Date().toISOString().split('T')[0],
    end:   new Date().toISOString().split('T')[0],
  });

  // ── Modales ───────────────────────────────────────────────────────────────
  const [selectedSale,     setSelectedSale]     = useState(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseData,      setExpenseData]      = useState({ amount: '', reason: '' });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. CARGA DATOS POR RANGO DE FECHAS
  // ───────────────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    if (!userData) return;
    setLoading(true);
    try {
      const [sy, sm, sd] = dateRange.start.split('-').map(Number);
      const [ey, em, ed] = dateRange.end.split('-').map(Number);
      const startDate    = new Date(sy, sm - 1, sd,  0,  0,  0,   0);
      const endDate      = new Date(ey, em - 1, ed, 23, 59, 59, 999);

      // Ventas
      let salesQ = query(
        collection(db, 'sales'),
        where('date', '>=', startDate),
        where('date', '<=', endDate)
      );
      if (userData.role !== 'admin') {
        salesQ = query(
          collection(db, 'sales'),
          where('userId', '==', userData.id),
          where('date', '>=', startDate),
          where('date', '<=', endDate)
        );
      }
      const salesSnap = await getDocs(salesQ);
      const salesData = salesSnap.docs.map(d => ({
        id:   d.id,
        type: 'sale',
        ...d.data(),
        date: d.data().date?.toDate ? d.data().date.toDate() : new Date(d.data().date),
      }));

      // Gastos
      const expensesSnap = await getDocs(
        query(
          collection(db, 'shift_movements'),
          where('date', '>=', startDate),
          where('date', '<=', endDate)
        )
      );
      const expensesData = expensesSnap.docs.map(d => ({
        id:   d.id,
        type: 'expense',
        ...d.data(),
        date: d.data().date?.toDate ? d.data().date.toDate() : new Date(d.data().date),
      }));

      const combined = [...salesData, ...expensesData].sort((a, b) => b.date - a.date);
      setMergedHistory(combined);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast.error('Error al cargar los movimientos.');
    } finally {
      setLoading(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 2. BALANCE GLOBAL con getAggregateFromServer (sin bajar todos los docs)
  // ───────────────────────────────────────────────────────────────────────────
  const fetchGlobalBalance = async () => {
    if (userData?.role !== 'admin') return;
    setLoadingGlobal(true);
    try {
      const salesRef    = collection(db, 'sales');
      const expensesRef = collection(db, 'shift_movements');

      const [allSalesAgg, canceledAgg, expensesAgg] = await Promise.all([
        getAggregateFromServer(salesRef, { total: sum('total') }),
        getAggregateFromServer(
          query(salesRef, where('status', '==', 'canceled')),
          { total: sum('total') }
        ),
        getAggregateFromServer(expensesRef, { total: sum('amount') }),
      ]);

      const revenue  = (allSalesAgg.data().total  || 0) - (canceledAgg.data().total || 0);
      const expenses = expensesAgg.data().total || 0;
      setGlobalBalance(revenue - expenses);
    } catch (e) {
      console.error('Error balance global:', e);
      setGlobalBalance(null);
    } finally {
      setLoadingGlobal(false);
    }
  };

  useEffect(() => { fetchData(); },          [userData, dateRange]); // eslint-disable-line
  useEffect(() => { fetchGlobalBalance(); }, [userData]);            // eslint-disable-line

  // ───────────────────────────────────────────────────────────────────────────
  // ACCIONES
  // ───────────────────────────────────────────────────────────────────────────
  const handleAddExpenseAdmin = async () => {
    if (!expenseData.amount || !expenseData.reason) {
      return toast.warning('Complete el monto y el motivo del gasto.');
    }
    try {
      await addDoc(collection(db, 'shift_movements'), {
        shiftId: 'ADMIN_ENTRY',
        type:    'expense',
        amount:  parseFloat(expenseData.amount),
        reason:  expenseData.reason + ' (Admin)',
        date:    new Date(),
        user:    userData.name,
        status:  'active',
      });
      toast.success('Gasto registrado correctamente.');
      setShowExpenseModal(false);
      setExpenseData({ amount: '', reason: '' });
      fetchData();
      fetchGlobalBalance();
    } catch (e) {
      console.error(e);
      toast.error('Error al registrar el gasto.');
    }
  };

  const handleCancelSale = async (sale) => {
    if (!window.confirm(`¿⚠️ ESTÁ SEGURO?\n\nVa a anular el Ticket #${sale.ticketId}.`)) return;
    setLoading(true);
    try {
      for (const item of sale.items) {
        await updateDoc(doc(db, 'products', item.id), {
          current_stock: increment(parseFloat(item.quantity)),
        }).catch(() => {});
      }
      await updateDoc(doc(db, 'sales', sale.id), {
        status:     'canceled',
        canceledAt: new Date(),
        canceledBy: userData.name,
      });
      fetchData();
      fetchGlobalBalance();
      toast.success('Ticket anulado correctamente.');
    } catch (error) {
      console.error(error);
      toast.error('Error al anular el ticket.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelExpense = async (expense) => {
    if (!window.confirm(
      `¿Anular este gasto de ₲ ${expense.amount.toLocaleString()}?\n\nEl dinero volverá al balance.`
    )) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'shift_movements', expense.id), {
        status:     'canceled',
        canceledAt: new Date(),
        canceledBy: userData.name,
      });
      fetchData();
      fetchGlobalBalance();
      toast.success('Gasto anulado correctamente.');
    } catch (error) {
      console.error(error);
      toast.error('Error al anular el gasto.');
    } finally {
      setLoading(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // KPIs del PERÍODO FILTRADO
  // ───────────────────────────────────────────────────────────────────────────
  const filteredHistory = mergedHistory.filter(item => {
    const term = searchTerm.toLowerCase();
    return item.type === 'sale'
      ? (item.ticketId || '').toLowerCase().includes(term)
      : (item.reason  || '').toLowerCase().includes(term);
  });

  const activeSales   = filteredHistory.filter(i => i.type === 'sale'    && i.status !== 'canceled');
  const activeExpenses= filteredHistory.filter(i => i.type === 'expense' && i.status !== 'canceled');

  const grossSales     = activeSales.reduce((a, s) => a + (s.subTotal || s.total || 0), 0);
  const totalDiscounts = activeSales.reduce((a, s) => a + (s.discountTotal || 0), 0);
  const netSales       = activeSales.reduce((a, s) => a + (s.total || 0), 0);
  const totalCost      = activeSales.reduce((a, sale) => {
    const c = sale.items?.reduce((ia, item) => ia + ((item.cost || 0) * (item.quantity || 0)), 0) || 0;
    return a + c;
  }, 0);
  const grossProfit  = netSales - totalCost;
  const totalExpenses= activeExpenses.reduce((a, e) => a + (parseFloat(e.amount) || 0), 0);

  // ───────────────────────────────────────────────────────────────────────────
  // EXCEL
  // ───────────────────────────────────────────────────────────────────────────
  const handleExportExcel = () => {
    const rows = filteredHistory.map(item => {
      if (item.type === 'sale') {
        return {
          Tipo:           'VENTA',
          Ref:            item.ticketId,
          Fecha:          item.date.toLocaleDateString() + ' ' + item.date.toLocaleTimeString(),
          Usuario:        item.userName,
          Detalle:        item.appliedDiscounts?.length > 0 ? 'Con Descuentos' : 'Normal',
          Subtotal:       item.subTotal || item.total,
          Descuento:      item.discountTotal || 0,
          'Total Neto':   item.status === 'canceled' ? 0 : item.total,
          Estado:         item.status === 'canceled' ? 'ANULADO' : 'OK',
        };
      }
      return {
        Tipo:           'GASTO',
        Ref:            '-',
        Fecha:          item.date.toLocaleDateString() + ' ' + item.date.toLocaleTimeString(),
        Usuario:        item.user,
        Detalle:        item.reason,
        Subtotal:       0,
        Descuento:      0,
        'Total Neto':   item.status === 'canceled' ? 0 : item.amount * -1,
        Estado:         item.status === 'canceled' ? 'ANULADO' : 'OK',
      };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Reporte');
    XLSX.writeFile(wb, `Reporte_Bodega_${dateRange.start}.xlsx`);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ───────────────────────────────────────────────────────────────────────────
  const getMethodName = (m) =>
    ({ cash: 'Efectivo', qr: 'QR', card: 'Tarjeta', transfer: 'Transferencia' }[m] || 'Otro');

  // Tarjeta KPI con tooltip
  const KpiCard = ({ title, value, colorClass, icon: Icon, tooltip }) => (
    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm relative group hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-2">
        <p className="text-xs text-gray-500 font-bold uppercase flex items-center gap-1">
          {title}
          <span className="relative inline-block">
            <Info size={14} className="text-gray-300 cursor-help hover:text-gray-500" />
            <span className="invisible group-hover:visible opacity-0 group-hover:opacity-100
                             transition-opacity absolute left-0 bottom-full mb-2 w-48
                             bg-gray-800 text-white text-[10px] p-2 rounded shadow-lg z-10
                             pointer-events-none normal-case font-normal leading-tight">
              {tooltip}
              <span className="absolute top-full left-2 -mt-1 border-4 border-transparent border-t-gray-800" />
            </span>
          </span>
        </p>
        {Icon && <Icon size={18} className="text-gray-300" />}
      </div>
      <h3 className={`text-2xl font-black ${colorClass}`}>
        ₲ {value.toLocaleString()}
      </h3>
    </div>
  );

  // Paginación
  const indexOfLast  = currentPage * itemsPerPage;
  const indexOfFirst = indexOfLast - itemsPerPage;
  const currentItems = filteredHistory.slice(indexOfFirst, indexOfLast);
  const totalPages   = Math.ceil(filteredHistory.length / itemsPerPage);

  if (!userData) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // RENDER
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto pb-20">

      {/* ── MODAL GASTO ──────────────────────────────────────────────── */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-800">Registrar Gasto (Admin)</h3>
              <button onClick={() => setShowExpenseModal(false)}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="number"
                className="w-full border p-2.5 rounded-lg text-sm focus:outline-none focus:border-primary"
                placeholder="Monto (₲)"
                value={expenseData.amount}
                onChange={e => setExpenseData({ ...expenseData, amount: e.target.value })}
              />
              <input
                type="text"
                className="w-full border p-2.5 rounded-lg text-sm focus:outline-none focus:border-primary"
                placeholder="Motivo"
                value={expenseData.reason}
                onChange={e => setExpenseData({ ...expenseData, reason: e.target.value })}
              />
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowExpenseModal(false)}
                  className="flex-1 border p-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddExpenseAdmin}
                  className="flex-1 bg-red-600 text-white p-2.5 rounded-lg font-bold text-sm hover:bg-red-700 transition-colors"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER + BALANCE GLOBAL ───────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Movimientos y Ventas</h1>
          <p className="text-sm text-gray-500">Vista Gerencial Unificada</p>
        </div>

        {userData.role === 'admin' && (
          <div className="bg-gray-900 text-white p-4 rounded-xl shadow-lg flex items-center gap-4 min-w-[260px]">
            <div className="p-3 bg-white/10 rounded-full">
              <DollarSign size={24} className="text-green-400" />
            </div>
            <div>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                Capital Total Acumulado
              </p>
              {loadingGlobal ? (
                <Loader2 size={18} className="animate-spin mt-1 text-green-400" />
              ) : globalBalance !== null ? (
                <p className="text-2xl font-black text-white">
                  ₲ {globalBalance.toLocaleString()}
                </p>
              ) : (
                <button
                  onClick={fetchGlobalBalance}
                  className="mt-1 text-xs text-green-400 underline font-bold"
                >
                  Calcular balance
                </button>
              )}
              <p className="text-[10px] text-gray-500">Histórico (Ventas − Gastos)</p>
            </div>
          </div>
        )}
      </div>

      {/* ── BARRA DE FILTROS Y ACCIONES ───────────────────────────────── */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6
                      flex flex-col xl:flex-row gap-4 justify-between items-center">

        {/* Botones rápidos de fecha */}
        <div className="flex gap-2 overflow-x-auto pb-1 xl:pb-0 w-full xl:w-auto no-scrollbar">
          {[
            { label: 'Hoy',         val: 'today'     },
            { label: 'Ayer',        val: 'yesterday' },
            { label: 'Esta Semana', val: 'last7'     },
            { label: 'Este Mes',    val: 'month'     },
          ].map(btn => (
            <button
              key={btn.val}
              onClick={() => {
                const today = new Date();
                let start = new Date(); let end = new Date();
                if (btn.val === 'yesterday') {
                  start.setDate(today.getDate() - 1);
                  end.setDate(today.getDate() - 1);
                } else if (btn.val === 'last7') {
                  start.setDate(today.getDate() - 7);
                } else if (btn.val === 'month') {
                  start = new Date(today.getFullYear(), today.getMonth(), 1);
                  end   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                }
                const fmt = d => {
                  const off = d.getTimezoneOffset() * 60000;
                  return new Date(d.getTime() - off).toISOString().split('T')[0];
                };
                setDateRange({ start: fmt(start), end: fmt(end) });
              }}
              className="px-4 py-1.5 text-xs font-bold text-gray-600 bg-gray-100
                         hover:bg-gray-200 rounded-full whitespace-nowrap transition-colors"
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Selector de fechas manual */}
        <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200">
          <Calendar size={16} className="text-gray-400" />
          <input
            type="date"
            value={dateRange.start}
            onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
            className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none"
          />
          <span className="text-gray-400">-</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
            className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none"
          />
        </div>

        {/* Buscador + botones */}
        <div className="flex gap-2 w-full xl:w-auto">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Buscar ticket o motivo..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm
                         bg-gray-50 focus:bg-white focus:outline-none focus:border-primary"
            />
          </div>
          {userData.role === 'admin' && (
            <button
              onClick={() => setShowExpenseModal(true)}
              className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg
                         font-bold hover:bg-red-100 transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <TrendingDown size={18} /> <span className="hidden sm:inline">Gasto</span>
            </button>
          )}
          <button
            onClick={handleExportExcel}
            className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700
                       transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <FileSpreadsheet size={18} /> <span className="hidden sm:inline">Excel</span>
          </button>
        </div>
      </div>

      {/* ── KPI CARDS DEL PERÍODO ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KpiCard
          title="Ventas Brutas"    value={grossSales}     colorClass="text-gray-800"
          tooltip="La suma de todas las ventas antes de descuentos y reembolsos."
        />
        <KpiCard
          title="Descuentos"       value={totalDiscounts} colorClass="text-orange-500"
          tooltip="La suma de los descuentos aplicados en los tickets de venta."
        />
        <KpiCard
          title="Ventas Netas"     value={netSales}       colorClass="text-blue-600"
          tooltip="Ventas brutas menos descuentos y reembolsos."
        />
        <KpiCard
          title="Beneficio Bruto"  value={grossProfit}    colorClass="text-green-600"
          tooltip="Ventas netas menos costo de bienes (Ganancia Real)."
          icon={TrendingUp}
        />
        <KpiCard
          title="Egresos (Gastos)" value={totalExpenses}  colorClass="text-red-500"
          tooltip="Total de gastos operativos registrados en este periodo."
          icon={TrendingDown}
        />
      </div>

      {/* ── TABLA DETALLADA ───────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-[400px]">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-primary" size={40} />
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
            <Search size={30} />
            <p>No hay movimientos en este rango.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b text-gray-500 text-xs uppercase font-bold">
                  <tr>
                    <th className="px-6 py-4">Ref / Ticket</th>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Usuario</th>
                    <th className="px-6 py-4">Detalle</th>
                    <th className="px-6 py-4 text-right">Monto</th>
                    {userData.role === 'admin' && (
                      <th className="px-6 py-4 text-center">Acciones</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {currentItems.map(item => {
                    const isExpense  = item.type === 'expense';
                    const isCanceled = item.status === 'canceled';

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-gray-50 transition-colors
                          ${isCanceled ? 'bg-gray-50 opacity-60' : ''}`}
                      >
                        {/* Ref / Ticket */}
                        <td className="px-6 py-4 font-mono font-bold text-gray-600">
                          {isExpense ? (
                            <span className="flex items-center gap-2 text-red-500">
                              <TrendingDown size={14} /> GASTO
                            </span>
                          ) : (
                            <span className="flex items-center gap-2 text-green-600">
                              <Receipt size={14} /> {item.ticketId}
                            </span>
                          )}
                        </td>

                        {/* Fecha */}
                        <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                          {item.date.toLocaleDateString()}
                          <span className="text-gray-400 text-xs ml-1">
                            {item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>

                        {/* Usuario */}
                        <td className="px-6 py-4 text-gray-700">
                          <div className="flex items-center gap-2">
                            <User size={14} className="text-gray-400" />
                            {item.userName || item.user}
                          </div>
                        </td>

                        {/* Detalle */}
                        <td className="px-6 py-4 text-gray-600">
                          {isExpense ? (
                            <span className={`italic ${isCanceled ? 'line-through' : ''}`}>
                              {item.reason}
                              {isCanceled && (
                                <span className="ml-1 text-red-400 text-xs font-bold not-italic">(ANULADO)</span>
                              )}
                            </span>
                          ) : (
                            <div className="flex flex-col">
                              <span className={isCanceled ? 'line-through' : ''}>
                                {getMethodName(item.paymentMethod)}
                              </span>
                              {item.appliedDiscounts?.length > 0 && (
                                <span className="text-[10px] text-orange-500 font-bold flex items-center gap-1">
                                  <AlertTriangle size={10} /> Desc. Aplicado
                                </span>
                              )}
                              {isCanceled && (
                                <span className="text-[10px] text-red-400 font-bold">ANULADO</span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Monto */}
                        <td
                          className={`px-6 py-4 text-right font-black text-base
                            ${isCanceled
                              ? 'line-through text-gray-400'
                              : isExpense
                                ? 'text-red-500'
                                : 'text-gray-800'}`}
                        >
                          {isExpense ? '− ' : '+ '}
                          ₲ {parseFloat(isExpense ? item.amount : item.total).toLocaleString()}
                        </td>

                        {/* Acciones (solo admin) */}
                        {userData.role === 'admin' && (
                          <td className="px-6 py-4 text-center">
                            <div className="flex justify-center gap-2">
                              {!isExpense && !isCanceled && (
                                <button
                                  onClick={() => setSelectedSale(item)}
                                  className="text-blue-500 hover:bg-blue-50 p-2 rounded transition-colors"
                                  title="Ver Ticket"
                                >
                                  <Printer size={18} />
                                </button>
                              )}
                              {!isCanceled && (
                                <button
                                  onClick={() =>
                                    isExpense
                                      ? handleCancelExpense(item)
                                      : handleCancelSale(item)
                                  }
                                  className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded transition-colors"
                                  title={isExpense ? 'Anular Gasto' : 'Anular Venta'}
                                >
                                  <Ban size={18} />
                                </button>
                              )}
                              {isCanceled && (
                                <span className="text-xs font-bold text-red-300 border border-red-200 px-2 py-1 rounded">
                                  ANULADO
                                </span>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            <div className="border-t p-4 flex justify-between items-center bg-gray-50">
              <span className="text-xs text-gray-500">
                {indexOfFirst + 1}–{Math.min(indexOfLast, filteredHistory.length)} de {filteredHistory.length} registros
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 bg-white border rounded-lg text-sm hover:bg-gray-100
                             disabled:opacity-50 transition-colors"
                >
                  Anterior
                </button>
                <span className="px-3 py-2 text-sm font-medium text-gray-700">
                  {currentPage} / {totalPages || 1}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="px-4 py-2 bg-white border rounded-lg text-sm hover:bg-gray-100
                             disabled:opacity-50 transition-colors"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── MODAL TICKET ──────────────────────────────────────────────── */}
      {selectedSale && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800">Ticket #{selectedSale.ticketId}</h3>
              <button
                onClick={() => setSelectedSale(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={22} />
              </button>
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
              <button
                onClick={() => window.print()}
                className="flex-1 bg-black text-white py-3 rounded-lg font-bold
                           flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors"
              >
                <Printer size={18} /> IMPRIMIR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Área de impresión oculta */}
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