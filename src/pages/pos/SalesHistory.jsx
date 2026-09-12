import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  collection, query, where, getDocs, doc,
  updateDoc, increment, addDoc, getDoc, writeBatch
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  Receipt, Loader2, Printer, Search, User,
  FileSpreadsheet, Calendar, TrendingUp, Ban,
  AlertTriangle, TrendingDown, X, Info,
  ChevronLeft, ChevronsLeft, ChevronRight, ChevronsRight, HandCoins
} from 'lucide-react';
import TicketInvoice from './TicketInvoice';
import * as XLSX from 'xlsx';
import { printTicketService } from '../../utils/printUtils';
import { sileo } from 'sileo';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { todayStrPY, formatDate as fmtDate, formatTime } from '../../utils/dateUtils';
import { formatGuaranies, parseGuaraniesStr } from '../../utils/moneyUtils';

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
  const [dateRange, setDateRange] = useState({
    start: todayStrPY(),
    end:   todayStrPY(),
  });

  // ── Modales ───────────────────────────────────────────────────────────────
  const [selectedSale,     setSelectedSale]     = useState(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseData,      setExpenseData]      = useState({ amount: '', reason: '', date: todayStrPY() });
  const [confirmModal,     setConfirmModal]     = useState(null);

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
      sileo.error({ title: 'Error al cargar los movimientos.' });
    } finally {
      setLoading(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // ───────────────────────────────────────────────────────────────────────────
  // 2. BALANCE GLOBAL
  //    getAggregateFromServer con where() SIEMPRE requiere índice compuesto.
  //    Solución definitiva: 3 getDocs en paralelo, suma en el cliente.
  //    - sales:            traemos solo 'total' (pocas lecturas por campo)
  //    - shift_movements:  solo gastos activos
  // ───────────────────────────────────────────────────────────────────────────
  const fetchGlobalBalance = async () => {
    if (userData?.role !== 'admin') return;
    setLoadingGlobal(true);
    try {
      const salesRef    = collection(db, 'sales');
      const expensesRef = collection(db, 'shift_movements');

      // 3 queries en paralelo — sin ningún getAggregateFromServer con where
      const [allSalesSnap, canceledSnap, expensesSnap] = await Promise.all([
        getDocs(query(salesRef)),
        getDocs(query(salesRef,    where('status', '==', 'canceled'))),
        getDocs(query(expensesRef, where('type',   '==', 'expense'))),
      ]);

      const totalSales    = allSalesSnap.docs.reduce(
        (acc, d) => acc + parseFloat(d.data().total  || 0), 0
      );
      const canceledTotal = canceledSnap.docs.reduce(
        (acc, d) => acc + parseFloat(d.data().total  || 0), 0
      );
      const totalExpenses = expensesSnap.docs.reduce(
        (acc, d) => {
          const data = d.data();
          // Excluir gastos anulados — igual que la versión anterior
          return data.status !== 'canceled' ? acc + parseFloat(data.amount || 0) : acc;
        }, 0
      );

      const revenue = totalSales - canceledTotal;
      setGlobalBalance(revenue - totalExpenses);
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
    if (!expenseData.amount || !expenseData.reason || !expenseData.date) {
      return sileo.warning({ title: 'Complete todos los campos obligatorios.' });
    }
    try {
      // Procesar la fecha seleccionada en zona horaria local
      const [gy, gm, gd] = expenseData.date.split('-').map(Number);
      const now = new Date();
      const isToday = (
        now.getFullYear() === gy &&
        (now.getMonth() + 1) === gm &&
        now.getDate() === gd
      );
      // Si es hoy, registrar hora actual exacta. Si es retroactivo, mediodía local para evitar desfase de día.
      const finalDate = isToday ? now : new Date(gy, gm - 1, gd, 12, 0, 0, 0);

      await addDoc(collection(db, 'shift_movements'), {
        shiftId: 'ADMIN_ENTRY',
        type:    'expense',
        amount:  parseFloat(expenseData.amount),
        reason:  expenseData.reason + ' (Admin)',
        date:    finalDate,
        user:    userData.name,
        status:  'active',
      });
      sileo.success({ title: 'Gasto registrado correctamente.' });
      setShowExpenseModal(false);
      setExpenseData({ amount: '', reason: '', date: todayStrPY() });
      fetchData();
      fetchGlobalBalance();
    } catch (e) {
      console.error(e);
      sileo.error({ title: 'Error al registrar el gasto.' });
    }
  };

  const handleCancelSale = (sale) => {
    setConfirmModal({
      title:       `¿Anular ticket #${sale.ticketId}?`,
      description: `Total: ₲ ${sale.total.toLocaleString()}. El stock será devuelto.`,
      confirmText: 'Sí, anular',
      variant:     'void',
      onConfirm:   () => _executeCancelSale(sale),
    });
  };

  const _executeCancelSale = async (sale) => {
    setLoading(true);
    try {
      // Devolver stock de producto (best-effort: los ids de variantes no son documentos propios)
      for (const item of sale.items) {
        await updateDoc(doc(db, 'products', item.id), {
          current_stock: increment(parseFloat(item.quantity)),
        }).catch(() => {});
      }

      // Cargas manuales usan shiftId 'MANUAL_ENTRY' / 'unknown', que no son turnos reales
      const shiftRef = (sale.shiftId && sale.shiftId !== 'MANUAL_ENTRY' && sale.shiftId !== 'unknown')
        ? doc(db, 'shifts', sale.shiftId)
        : null;
      const shiftSnap = shiftRef ? await getDoc(shiftRef) : null;

      // Sale + lotes FIFO + total cacheado del turno se actualizan atómicamente
      // (todos son documentos que sabemos que existen, a diferencia del stock de arriba)
      const salesBatch = writeBatch(db);
      salesBatch.update(doc(db, 'sales', sale.id), {
        status:     'canceled',
        canceledAt: new Date(),
        canceledBy: userData.name,
      });
      for (const item of sale.items) {
        // Devolver las unidades a los lotes FIFO exactos que se consumieron en la venta
        (item.batchConsumption || []).forEach(({ batchId, qty }) => {
          salesBatch.update(doc(db, 'inventory_batches', batchId), {
            qtyRemaining: increment(parseFloat(qty)),
          });
        });
      }
      if (shiftSnap?.exists()) {
        salesBatch.update(shiftRef, { salesTotal: increment(-sale.total) });
      }
      await salesBatch.commit();

      fetchData();
      fetchGlobalBalance();
      sileo.success({ title: 'Ticket anulado correctamente.' });
    } catch (error) {
      console.error(error);
      sileo.error({ title: 'Error al anular el ticket.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelExpense = (expense) => {
    setConfirmModal({
      title:       '¿Anular este gasto?',
      description: `₲ ${expense.amount.toLocaleString()} — ${expense.reason || ''}. El monto volverá al balance.`,
      confirmText: 'Sí, anular gasto',
      variant:     'warning',
      onConfirm:   () => _executeCancelExpense(expense),
    });
  };

  const _executeCancelExpense = async (expense) => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'shift_movements', expense.id), {
        status:     'canceled',
        canceledAt: new Date(),
        canceledBy: userData.name,
      });
      fetchData();
      fetchGlobalBalance();
      sileo.success({ title: 'Gasto anulado correctamente.' });
    } catch (error) {
      console.error(error);
      sileo.error({ title: 'Error al anular el gasto.' });
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
  const totalFiado   = activeSales.filter(s => s.paymentMethod === 'fiado').reduce((a, s) => a + (s.total || 0), 0);

  // ───────────────────────────────────────────────────────────────────────────
  // EXCEL
  // ───────────────────────────────────────────────────────────────────────────
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // ── HOJA 1: REPORTE (ventas + gastos con Ganancia Bruta) ─────────────────
    const reportRows = filteredHistory.map(item => {
      if (item.type === 'sale') {
        const isCanceled = item.status === 'canceled';
        const subtotal   = item.subTotal || item.total || 0;
        const descuento  = item.discountTotal || 0;
        const totalNeto  = isCanceled ? 0 : (item.total || 0);

        // Costo total de todos los ítems del ticket
        const costoMerc = isCanceled ? 0 :
          (item.items || []).reduce((acc, i) =>
            acc + (parseFloat(i.cost || 0) * parseFloat(i.quantity || 0)), 0);

        const gananciaBruta = isCanceled ? 0 : totalNeto - costoMerc;

        return {
          'Tipo':              'VENTA',
          'Ticket':            item.ticketId,
          'Fecha':             fmtDate(item.date),
          'Hora':              formatTime(item.date),
          'Cajero':            item.userName || '',
          'Cliente':           item.client?.name || 'SIN NOMBRE',
          'Método Pago':       item.paymentMethod === 'cash' ? 'Efectivo'
                             : item.paymentMethod === 'qr'   ? 'QR'
                             : item.paymentMethod === 'card' ? 'Tarjeta'
                             : item.paymentMethod === 'transfer' ? 'Transferencia'
                             : item.paymentMethod === 'fiado' ? 'Fiado'
                             : item.paymentMethod || '-',
          'Subtotal':          subtotal,
          'Descuento':         descuento,
          'Total + IVA':       totalNeto,
          'Costo Mercadería':  costoMerc,
          'Ganancia Bruta':    gananciaBruta,
          'Estado':            isCanceled ? 'ANULADO' : 'OK',
        };
      }
      // Gastos
      return {
        'Tipo':              'GASTO',
        'Ticket':            '-',
        'Fecha':             fmtDate(item.date),
        'Hora':              formatTime(item.date),
        'Cajero':            item.user || '',
        'Cliente':           '-',
        'Método Pago':       '-',
        'Subtotal':          0,
        'Descuento':         0,
        'Total Neto':        item.status === 'canceled' ? 0 : (item.amount || 0) * -1,
        'Costo Mercadería':  0,
        'Ganancia Bruta':    0,
        'Estado':            item.status === 'canceled' ? 'ANULADO' : 'OK',
      };
    });

    const wsReporte = XLSX.utils.json_to_sheet(reportRows);

    // Ancho de columnas para Reporte
    wsReporte['!cols'] = [
      { wch: 8 },  // Tipo
      { wch: 12 }, // Ticket
      { wch: 12 }, // Fecha
      { wch: 7 },  // Hora
      { wch: 14 }, // Cajero
      { wch: 20 }, // Cliente
      { wch: 14 }, // Método Pago
      { wch: 12 }, // Subtotal
      { wch: 11 }, // Descuento
      { wch: 12 }, // Total Neto
      { wch: 16 }, // Costo Mercadería
      { wch: 14 }, // Ganancia Bruta
      { wch: 9 },  // Estado
    ];

    XLSX.utils.book_append_sheet(wb, wsReporte, 'Reporte');

    // ── HOJA 2: TOTAL PRODUCTOS ───────────────────────────────────────────────
    // Agrupa todas las ventas activas del período por nombre de producto
    const productMap = {};

    filteredHistory.forEach(item => {
      if (item.type !== 'sale' || item.status === 'canceled') return;
      (item.items || []).forEach(prod => {
        const nombre = prod.name || 'Sin nombre';
        if (!productMap[nombre]) {
          productMap[nombre] = {
            'Producto':           nombre,
            'Cantidad Vendida':   0,
            'Ingresos Brutos':    0,
            'Costo Total':        0,
            'Ganancia Bruta':     0,
          };
        }
        const qty      = parseFloat(prod.quantity || 0);
        const precio   = parseFloat(prod.price    || 0);
        const costo    = parseFloat(prod.cost     || 0);
        const ingreso  = precio * qty;
        const costoTot = costo  * qty;

        productMap[nombre]['Cantidad Vendida'] += qty;
        productMap[nombre]['Ingresos Brutos']  += ingreso;
        productMap[nombre]['Costo Total']      += costoTot;
        productMap[nombre]['Ganancia Bruta']   += ingreso - costoTot;
      });
    });

    // Ordenar por mayor cantidad vendida
    const productRows = Object.values(productMap)
      .sort((a, b) => b['Cantidad Vendida'] - a['Cantidad Vendida']);

    // Fila de totales al final
    const totales = {
      'Producto':           'TOTAL',
      'Cantidad Vendida':   productRows.reduce((a, r) => a + r['Cantidad Vendida'], 0),
      'Ingresos Brutos':    productRows.reduce((a, r) => a + r['Ingresos Brutos'], 0),
      'Costo Total':        productRows.reduce((a, r) => a + r['Costo Total'], 0),
      'Ganancia Bruta':     productRows.reduce((a, r) => a + r['Ganancia Bruta'], 0),
    };

    const wsProductos = XLSX.utils.json_to_sheet([...productRows, totales]);

    wsProductos['!cols'] = [
      { wch: 30 }, // Producto
      { wch: 16 }, // Cantidad Vendida
      { wch: 16 }, // Ingresos Brutos
      { wch: 14 }, // Costo Total
      { wch: 14 }, // Ganancia Bruta
    ];

    XLSX.utils.book_append_sheet(wb, wsProductos, 'Total Productos');

    XLSX.writeFile(wb, `Reporte_Bodega_${dateRange.start}_${dateRange.end}.xlsx`);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ───────────────────────────────────────────────────────────────────────────
  const getMethodName = (m) =>
    ({ cash: 'Efectivo', qr: 'QR', card: 'Tarjeta', transfer: 'Transferencia', fiado: 'Fiado' }[m] || 'Otro');

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

  const handlePrint = async () => {
    if (!selectedSale) return;

    let storeData = {};
    try {
      const snap = await getDoc(doc(db, 'settings', 'general'));
      if (snap.exists()) storeData = snap.data();
    } catch (e) { /* usar defaults */ }

    const tData = {
      cart:             selectedSale.items || [],
      total:            selectedSale.total,
      amountPaid:       selectedSale.amountReceived || selectedSale.total,
      change:           selectedSale.change || 0,
      paymentMethod:    selectedSale.paymentMethod,
      ticketId:         selectedSale.ticketId,
      date:             selectedSale.date?.toISOString?.() || selectedSale.date,
      client:           selectedSale.client,
      cashierName:      selectedSale.userName,
      subTotal:         selectedSale.subTotal,
      discountTotal:    selectedSale.discountTotal,
      appliedDiscounts: selectedSale.appliedDiscounts,
    };

    const printed = await printTicketService(tData, storeData);
    if (!printed) {
      // Fallback
      const printJob = (footerLabel) => {
        const ticketEl = document.getElementById('printable-ticket-content');
        if (!ticketEl) return;

        const win = window.open('', '_blank', 'width=350,height=650,toolbar=no,menubar=no,scrollbars=no');
        if (!win) { alert('Habilitá los pop-ups para este sitio.'); return; }

        win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Courier New',monospace; width:80mm; background:white; }
    @page { size:80mm auto; margin:0; }
    .footer-label {
      text-align:center; font-weight:900; font-size:12px;
      text-transform:uppercase; letter-spacing:2px;
      border-top:1px dashed #555; padding-top:6px;
      margin:8px 8px 10px; font-family:'Courier New',monospace;
    }
  </style>
</head>
<body>
  ${ticketEl.innerHTML}
  <div class="footer-label">${footerLabel}</div>
</body>
</html>`);
        win.document.close();
        setTimeout(() => {
          win.focus();
          win.print();
          setTimeout(() => win.close(), 500);
        }, 1000);
      };

      printJob('ORIGINAL — CLIENTE');
      setTimeout(() => {
        printJob('COPIA — TICKET');
      }, 1500);
    }
  };

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

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

      {/* Modal de confirmación para acciones destructivas */}
      {confirmModal && (
        <ConfirmModal {...confirmModal} onClose={() => setConfirmModal(null)} />
      )}

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
                type="text"
                inputMode="numeric"
                className="w-full border p-2.5 rounded-lg text-sm focus:outline-none focus:border-primary"
                placeholder="Monto (₲)"
                value={formatGuaranies(expenseData.amount)}
                onChange={e => setExpenseData({ ...expenseData, amount: parseGuaraniesStr(e.target.value) })}
              />
              <input
                type="text"
                className="w-full border p-2.5 rounded-lg text-sm focus:outline-none focus:border-primary"
                placeholder="Motivo"
                value={expenseData.reason}
                onChange={e => setExpenseData({ ...expenseData, reason: e.target.value })}
              />
              
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Fecha del Gasto</label>
                <input
                  type="date"
                  className="w-full border p-2.5 rounded-lg text-sm focus:outline-none focus:border-primary text-gray-700 bg-white"
                  value={expenseData.date}
                  onChange={e => setExpenseData({ ...expenseData, date: e.target.value })}
                />
              </div>

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
            <div className="p-3 bg-white/10 rounded-full w-12 h-12 flex items-center justify-center font-black text-xl text-green-400 select-none">
              ₲
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
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
        <KpiCard
          title="Fiados"           value={totalFiado}     colorClass="text-amber-600"
          tooltip="Total vendido a crédito (fiado) en este periodo. Este dinero aún no fue cobrado y no forma parte del efectivo en caja."
          icon={HandCoins}
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
                          {fmtDate(item.date)}
                          <span className="text-gray-400 text-xs ml-1">
                            {formatTime(item.date)}
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

            {/* ── PAGINADOR PREMIUM ── */}
            <div className="border-t border-gray-100 bg-white px-5 py-3 flex flex-col sm:flex-row justify-between items-center gap-3">
              <p className="text-xs text-gray-400 whitespace-nowrap">
                Mostrando <span className="font-semibold text-gray-600">{filteredHistory.length === 0 ? 0 : indexOfFirst + 1}</span>–<span className="font-semibold text-gray-600">{Math.min(indexOfLast, filteredHistory.length)}</span> de <span className="font-semibold text-gray-600">{filteredHistory.length}</span> registros
              </p>
              
              <div className="flex items-center gap-1">
                {/* Primera página */}
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-green-50 hover:text-primary hover:border-green-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="Primera página"
                ><ChevronsLeft size={14} /></button>

                {/* Anterior */}
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-green-50 hover:text-primary hover:border-green-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="Página anterior"
                ><ChevronLeft size={14} /></button>

                {/* Números de página */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1))
                  .reduce((acc, p, idx, arr) => {
                    if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === '...' ? (
                      <span key={`ellipsis-${idx}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm">…</span>
                    ) : (
                      <button
                        type="button"
                        key={item}
                        onClick={() => setCurrentPage(item)}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-all border ${
                          currentPage === item
                            ? 'bg-primary text-white border-primary shadow-sm shadow-green-200'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-green-50 hover:text-primary hover:border-green-300'
                        }`}
                      >{item}</button>
                    )
                  )
                }

                {/* Siguiente */}
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-green-50 hover:text-primary hover:border-green-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="Página siguiente"
                ><ChevronRight size={14} /></button>

                {/* Última página */}
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-green-50 hover:text-primary hover:border-green-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="Última página"
                ><ChevronsRight size={14} /></button>
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
                onClick={handlePrint}
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
        <div id="printable-ticket-content" style={{position:'absolute',left:'-9999px',top:0,width:'80mm',background:'white'}}>
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
            copyLabel="__HIDE_FOOTER__"
          />
        </div>
      )}
    </div>
  );
}