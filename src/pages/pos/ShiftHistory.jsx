import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  Clock, User, CreditCard, Calendar, ChevronDown, ChevronUp,
  Loader2, Wallet, FileSpreadsheet, ChevronLeft, ChevronRight,
  TrendingUp, Tag, ClipboardList, Info, ChevronsLeft, ChevronsRight,
  Printer, X, Receipt
} from 'lucide-react';
import * as XLSX from 'xlsx';
import ShiftCloseTicket from './ShiftCloseTicket';

export default function ShiftHistory() {
  const [allShifts,    setAllShifts]    = useState([]);
  const [manualGroups, setManualGroups] = useState([]);   // ventas manuales agrupadas por fecha
  const [combined,     setCombined]     = useState([]);   // shifts + grupos manuales ordenados
  const [loading,      setLoading]      = useState(true);

  const [expandedId,     setExpandedId]     = useState(null);
  const [shiftDetails,   setShiftDetails]   = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [generatingExcel, setGeneratingExcel] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // ── Estado para modal de ticket de cierre ──────────────────────────────────
  const [ticketModal, setTicketModal] = useState(null);  // { shiftData, salesTotal, expensesTotal }
  const [loadingTicket, setLoadingTicket] = useState(false);

  // ── Carga inicial: turnos reales + ventas manuales ──────────────────────────
  useEffect(() => {
    const fetchAll = async () => {
      try {
        // 1. Turnos reales
        const shiftsSnap = await getDocs(
          query(collection(db, 'shifts'), orderBy('openTime', 'desc'))
        );
        const shiftsData = shiftsSnap.docs.map(d => ({
          id:        d.id,
          _type:     'shift',
          ...d.data(),
          openDate:  d.data().openTime?.toDate(),
          closeDate: d.data().closeTime?.toDate(),
        }));
        setAllShifts(shiftsData);

        // 2. Ventas manuales (source = 'manual')
        const manualSnap = await getDocs(
          query(collection(db, 'sales'), where('source', '==', 'manual'))
        );
        const manualSales = manualSnap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          dateObj: d.data().date?.toDate ? d.data().date.toDate() : new Date(d.data().date),
          registeredAt: d.data().registeredAt?.toDate ? d.data().registeredAt.toDate() : new Date(),
        }));

        // Agrupar por fecha de venta (YYYY-MM-DD)
        const groupMap = {};
        manualSales.forEach(sale => {
          const key = sale.dateObj.toISOString().split('T')[0];
          if (!groupMap[key]) {
            groupMap[key] = {
              id:            `MANUAL-${key}`,
              _type:         'manual',
              dateKey:       key,
              openDate:      sale.dateObj,
              registeredBy:  sale.registeredBy || 'Admin',
              sales:         [],
              salesTotal:    0,
              discountTotal: 0,
            };
          }
          groupMap[key].sales.push(sale);
          groupMap[key].salesTotal    += parseFloat(sale.total    || 0);
          groupMap[key].discountTotal += parseFloat(sale.discountTotal || 0);
        });

        const groups = Object.values(groupMap).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
        setManualGroups(groups);

      } catch (e) {
        console.error('Error cargando turnos:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  // ── Combinar y filtrar ───────────────────────────────────────────────────────
  useEffect(() => {
    let items = [
      ...allShifts,
      ...manualGroups,
    ];

    // Filtro de fechas
    if (dateRange.start && dateRange.end) {
      const [sy, sm, sd] = dateRange.start.split('-').map(Number);
      const [ey, em, ed] = dateRange.end.split('-').map(Number);
      const start = new Date(sy, sm - 1, sd,  0,  0,  0,   0);
      const end   = new Date(ey, em - 1, ed, 23, 59, 59, 999);
      items = items.filter(item => {
        const d = item.openDate;
        return d >= start && d <= end;
      });
    }

    // Ordenar por fecha descendente
    items.sort((a, b) => (b.openDate?.getTime() || 0) - (a.openDate?.getTime() || 0));

    setCombined(items);
    setCurrentPage(1);
  }, [allShifts, manualGroups, dateRange]);

  // ── Paginación ───────────────────────────────────────────────────────────────
  const indexOfLast  = currentPage * itemsPerPage;
  const indexOfFirst = indexOfLast - itemsPerPage;
  const currentItems = combined.slice(indexOfFirst, indexOfLast);
  const totalPages   = Math.ceil(combined.length / itemsPerPage);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // ── Expandir turno real ──────────────────────────────────────────────────────
  const handleExpand = async (item) => {
    if (expandedId === item.id) { setExpandedId(null); return; }

    setExpandedId(item.id);
    setLoadingDetails(true);
    setShiftDetails(null);

    try {
      if (item._type === 'manual') {
        // Detalle de ventas manuales del grupo
        const sales = item.sales;
        let cash = 0, qr = 0, card = 0, transfer = 0;
        let profitCalc = 0, totalDiscounts = 0;

        sales.forEach(sale => {
          const total = parseFloat(sale.total || 0);
          if (sale.paymentMethod === 'cash')     cash     += total;
          else if (sale.paymentMethod === 'qr')  qr       += total;
          else if (sale.paymentMethod === 'card') card     += total;
          else if (sale.paymentMethod === 'transfer') transfer += total;

          totalDiscounts += parseFloat(sale.discountTotal || 0);

          const sp = sale.items?.reduce((a, i) => a + (((i.price||0)-(i.cost||0))*(i.quantity||0)), 0) || 0;
          profitCalc += sp - (sale.discountTotal || 0);
        });

        setShiftDetails({
          cashTotal:        cash,
          digitalTotal:     qr + card + transfer,
          breakdown:        { cash, qr, card, transfer },
          ticketCount:      sales.length,
          calculatedProfit: profitCalc,
          totalDiscounts,
          isManual:         true,
          registeredBy:     item.registeredBy,
          manualSales:      sales,
        });

      } else {
        // Turno real: consulta ventas por shiftId
        const q    = query(collection(db, 'sales'), where('shiftId', '==', item.id));
        const snap = await getDocs(q);

        let cash = 0, qr = 0, card = 0, transfer = 0;
        let profitCalc = 0, totalDiscounts = 0;

        snap.docs.forEach(d => {
          const sale  = d.data();
          const total = parseFloat(sale.total || 0);
          if (sale.paymentMethod === 'cash')     cash     += total;
          else if (sale.paymentMethod === 'qr')  qr       += total;
          else if (sale.paymentMethod === 'card') card     += total;
          else if (sale.paymentMethod === 'transfer') transfer += total;

          totalDiscounts += (sale.discountTotal || 0);
          const sp = sale.items?.reduce((a, i) => a + (((i.price||0)-(i.cost||0))*(i.quantity||0)), 0) || 0;
          profitCalc += (sp - (sale.discountTotal || 0));
        });

        setShiftDetails({
          cashTotal:        cash,
          digitalTotal:     qr + card + transfer,
          breakdown:        { cash, qr, card, transfer },
          ticketCount:      snap.size,
          calculatedProfit: profitCalc,
          totalDiscounts,
          isManual:         false,
        });
      }
    } catch (e) {
      console.error('Error detalles:', e);
    } finally {
      setLoadingDetails(false);
    }
  };

  // ── Exportar Excel ───────────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    setGeneratingExcel(true);
    try {
      const dataToExport = await Promise.all(combined.map(async (item) => {
        if (item._type === 'manual') {
          return {
            Tipo:                    'REGISTRO MANUAL',
            Cajero:                  item.registeredBy,
            Estado:                  'COMPLETADO',
            'Fecha Apertura':        item.openDate?.toLocaleDateString(),
            'Hora Apertura':         '-',
            'Fecha Cierre':          '-',
            'Hora Cierre':           '-',
            'Base Inicial':          0,
            'Venta Bruta (Est.)':    item.salesTotal + item.discountTotal,
            'Descuentos (-)':        item.discountTotal,
            'Total Neto Vendido':    item.salesTotal,
            'Ganancia Neta':         0,
            'Total Caja (Base+Ventas)': item.salesTotal,
          };
        }

        const q    = query(collection(db, 'sales'), where('shiftId', '==', item.id));
        const snap = await getDocs(q);
        let totalDiscountShift = 0, finalProfit = 0;

        snap.docs.forEach(d => {
          const s = d.data();
          totalDiscountShift += (s.discountTotal || 0);
          const sp = s.items?.reduce((pA, i) => pA + (((i.price||0)-(i.cost||0))*(i.quantity||0)), 0) || 0;
          finalProfit += (sp - (s.discountTotal || 0));
        });

        return {
          Tipo:                    'TURNO',
          Cajero:                  item.userName,
          Estado:                  item.status === 'open' ? 'ABIERTO' : 'CERRADO',
          'Fecha Apertura':        item.openDate?.toLocaleDateString(),
          'Hora Apertura':         item.openDate?.toLocaleTimeString(),
          'Fecha Cierre':          item.closeDate?.toLocaleDateString() || '-',
          'Hora Cierre':           item.closeDate?.toLocaleTimeString() || '-',
          'Base Inicial':          item.startingCash || 0,
          'Venta Bruta (Est.)':    (item.salesTotal || 0) + totalDiscountShift,
          'Descuentos (-)':        totalDiscountShift,
          'Total Neto Vendido':    item.salesTotal || 0,
          'Ganancia Neta':         finalProfit,
          'Total Caja (Base+Ventas)': (item.startingCash || 0) + (item.salesTotal || 0),
        };
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Historial Cajas');
      XLSX.writeFile(wb, `Cajas_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      console.error('Error exportando:', e);
    } finally {
      setGeneratingExcel(false);
    }
  };

  // ── Ver ticket de cierre de un turno cerrado ────────────────────────────────
  const handleViewCloseTicket = async (shift) => {
    setLoadingTicket(true);
    try {
      const movQ = query(collection(db, 'shift_movements'), where('shiftId', '==', shift.id));
      const movSnap = await getDocs(movQ);
      const totalExpenses = movSnap.docs.reduce((acc, d) => acc + (d.data().amount || 0), 0);

      setTicketModal({
        shiftData: {
          id:           shift.id,
          userName:     shift.userName,
          openTime:     shift.openDate,
          closeTime:    shift.closeDate,
          startingCash: shift.startingCash || 0,
        },
        salesTotal:    shift.salesTotal || 0,
        expensesTotal: totalExpenses,
      });
    } catch (e) {
      console.error('Error cargando ticket de cierre:', e);
    } finally {
      setLoadingTicket(false);
    }
  };

  const handlePrintCloseTicket = () => {
    const ticketEl = document.getElementById('shift-close-ticket-print');
    if (!ticketEl) return;
    const win = window.open('', '_blank', 'width=350,height=700,toolbar=no,menubar=no,scrollbars=no');
    if (!win) { alert('Habilitá los pop-ups para este sitio.'); return; }
    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<script src="https://cdn.tailwindcss.com"><\/script>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;width:80mm;background:white}@page{size:80mm auto;margin:0}</style>
</head><body>${ticketEl.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); setTimeout(() => win.close(), 500); }, 1000);
  };

  if (loading) {
    return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto pb-20">

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Historial de Cajas</h1>
          <p className="text-sm text-gray-500">Auditoría de turnos y cargas manuales.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
            <Calendar size={18} className="text-gray-400" />
            <input type="date" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} className="text-sm font-medium text-gray-600 focus:outline-none" />
            <span className="text-gray-400">-</span>
            <input type="date" value={dateRange.end}   onChange={e => setDateRange({ ...dateRange, end: e.target.value })}   className="text-sm font-medium text-gray-600 focus:outline-none" />
          </div>
          <button onClick={handleExportExcel} disabled={combined.length === 0 || generatingExcel}
            className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-green-700 disabled:opacity-50 shadow-sm transition-colors">
            {generatingExcel ? <Loader2 className="animate-spin" size={18} /> : <FileSpreadsheet size={18} />}
            {generatingExcel ? 'Generando...' : 'Excel'}
          </button>
        </div>
      </div>

      {/* ── LISTA ──────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {currentItems.map((item) => {
          const isExpanded = expandedId === item.id;
          const isManual   = item._type === 'manual';
          const isOpen     = !isManual && item.status === 'open';
          const displayProfit = !isManual && item.profitTotal !== undefined ? item.profitTotal : 0;

          return (
            <div key={item.id}
              className={`bg-white rounded-xl border transition-all overflow-hidden
                ${isExpanded
                  ? isManual ? 'border-indigo-400 shadow-md' : 'border-primary shadow-md'
                  : 'border-gray-200 shadow-sm'}`}>

              {/* ── CABECERA ──────────────────────────────────────── */}
              <div onClick={() => handleExpand(item)}
                className="p-5 flex flex-col md:flex-row items-center justify-between cursor-pointer hover:bg-gray-50 gap-4">

                {/* Info */}
                <div className="flex items-center gap-4 w-full md:w-auto">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0
                    ${isManual ? 'bg-indigo-500' : isOpen ? 'bg-green-500' : 'bg-gray-600'}`}>
                    {isManual
                      ? <ClipboardList size={22} />
                      : item.userName?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 flex items-center gap-2 flex-wrap">
                      {isManual ? (
                        <>
                          <span className="text-indigo-700">Carga Manual</span>
                          <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-200 uppercase tracking-wide">
                            {item.sales.length} ticket{item.sales.length !== 1 ? 's' : ''}
                          </span>
                        </>
                      ) : (
                        <>
                          {item.userName}
                          {isOpen && (
                            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200 uppercase tracking-wide">Turno Actual</span>
                          )}
                        </>
                      )}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} /> {item.openDate?.toLocaleDateString()}
                      </span>
                      {!isManual && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} /> Apertura: {item.openDate?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {!isManual && item.closeDate && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} /> Cierre: {item.closeDate?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {isManual && (
                        <span className="flex items-center gap-1 text-indigo-500 font-medium">
                          <Info size={11} /> Cargado por: {item.registeredBy}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Resumen rápido */}
                <div className="flex items-center gap-8 w-full md:w-auto justify-between md:justify-end">
                  {!isManual && (
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Base Inicial</p>
                      <p className="font-medium text-gray-500">₲ {(item.startingCash || 0).toLocaleString()}</p>
                    </div>
                  )}
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total Vendido</p>
                    <p className="font-black text-lg text-gray-800">₲ {(item.salesTotal || 0).toLocaleString()}</p>
                  </div>
                  {!isManual && (
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider text-green-600">Ganancia Neta</p>
                      <p className="font-bold text-lg text-green-600">₲ {displayProfit.toLocaleString()}</p>
                    </div>
                  )}
                  {isManual && (
                    <div className="text-right">
                      <p className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">Desc. Aplicados</p>
                      <p className="font-bold text-base text-orange-500">
                        {item.discountTotal > 0 ? `- ₲ ${item.discountTotal.toLocaleString()}` : '—'}
                      </p>
                    </div>
                  )}
                  <div className="text-gray-400 pl-2">
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>
              </div>

              {/* ── DETALLES EXPANDIDOS ───────────────────────────── */}
              {isExpanded && (
                <div className={`border-t p-6 animate-fadeIn
                  ${isManual ? 'bg-indigo-50/30 border-indigo-100' : 'bg-gray-50 border-gray-100'}`}>
                  {loadingDetails ? (
                    <div className="flex justify-center py-4"><Loader2 className="animate-spin text-gray-400" /></div>
                  ) : shiftDetails ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

                        {/* Efectivo */}
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                          <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                            <Wallet className="text-green-600" size={18} /> Efectivo
                          </h4>
                          <div className="space-y-2 text-sm">
                            {!isManual && (
                              <div className="flex justify-between text-gray-500">
                                <span>Base</span><span>₲ {(item.startingCash || 0).toLocaleString()}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-green-700 font-bold">
                              <span>Ventas</span><span>₲ {shiftDetails.breakdown.cash.toLocaleString()}</span>
                            </div>
                            {!isManual && (
                              <div className="border-t border-dashed border-gray-300 my-2 pt-2 flex justify-between font-black text-gray-800">
                                <span>ENTREGAR:</span>
                                <span>₲ {((item.startingCash || 0) + shiftDetails.breakdown.cash).toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Digital */}
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                          <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                            <CreditCard className="text-blue-600" size={18} /> Digital
                          </h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between text-gray-500"><span>QR</span><span>₲ {shiftDetails.breakdown.qr.toLocaleString()}</span></div>
                            <div className="flex justify-between text-gray-500"><span>Tarjeta</span><span>₲ {shiftDetails.breakdown.card.toLocaleString()}</span></div>
                            <div className="flex justify-between text-gray-500"><span>Transf.</span><span>₲ {shiftDetails.breakdown.transfer.toLocaleString()}</span></div>
                            <div className="border-t border-dashed border-gray-300 my-2 pt-2 flex justify-between font-bold text-blue-600">
                              <span>TOTAL:</span><span>₲ {shiftDetails.digitalTotal.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        {/* Descuentos */}
                        <div className="bg-white p-4 rounded-xl border border-red-100 bg-red-50/20 shadow-sm text-center flex flex-col justify-center">
                          <Tag className="mx-auto text-red-400 mb-2" size={24} />
                          <p className="text-xs text-gray-400 font-bold uppercase">Total Descontado</p>
                          <p className="text-2xl font-black text-red-500 my-1">
                            {shiftDetails.totalDiscounts > 0
                              ? `- ₲ ${shiftDetails.totalDiscounts.toLocaleString()}`
                              : '₲ 0'}
                          </p>
                          <p className="text-[10px] text-gray-400">Descuentos del período</p>
                        </div>

                        {/* Rentabilidad */}
                        <div className="bg-white p-4 rounded-xl border border-green-100 bg-green-50/20 shadow-sm text-center flex flex-col justify-center">
                          <TrendingUp className="mx-auto text-green-500 mb-2" size={24} />
                          <p className="text-xs text-gray-400 font-bold uppercase">Rentabilidad Neta</p>
                          <p className="text-3xl font-black text-green-600 my-1">
                            ₲ {shiftDetails.calculatedProfit.toLocaleString()}
                          </p>
                          <p className="text-[10px] text-gray-400">{shiftDetails.ticketCount} tickets emitidos</p>
                        </div>
                      </div>

                      {/* Detalle de tickets manuales */}
                      {isManual && shiftDetails.manualSales?.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                            <ClipboardList size={12} /> Tickets registrados manualmente
                          </p>
                          <div className="bg-white rounded-xl border border-indigo-100 overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-indigo-50 text-indigo-600 font-bold uppercase text-[10px]">
                                <tr>
                                  <th className="px-4 py-2 text-left">Ticket</th>
                                  <th className="px-4 py-2 text-left">Cajero</th>
                                  <th className="px-4 py-2 text-left">Pago</th>
                                  <th className="px-4 py-2 text-right">Total</th>
                                  {shiftDetails.manualSales.some(s => s.notes) && (
                                    <th className="px-4 py-2 text-left">Notas</th>
                                  )}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {shiftDetails.manualSales.map(sale => (
                                  <tr key={sale.id} className="hover:bg-indigo-50/20">
                                    <td className="px-4 py-2 font-mono font-bold text-gray-700">{sale.ticketId}</td>
                                    <td className="px-4 py-2 text-gray-600">{sale.userName}</td>
                                    <td className="px-4 py-2">
                                      <span className="bg-gray-100 px-2 py-0.5 rounded-full text-gray-600 font-medium">
                                        {{ cash: 'Efectivo', qr: 'QR', card: 'Tarjeta', transfer: 'Transf.' }[sale.paymentMethod] || '-'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 text-right font-black text-gray-800">
                                      ₲ {parseFloat(sale.total).toLocaleString()}
                                    </td>
                                    {shiftDetails.manualSales.some(s => s.notes) && (
                                      <td className="px-4 py-2 text-gray-400 italic text-[10px] max-w-[140px] truncate">
                                        {sale.notes || '—'}
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Botón Ver Ticket de Cierre (solo turnos cerrados) */}
                      {!isManual && !isOpen && (
                        <div className="mt-4 flex justify-end">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleViewCloseTicket(item); }}
                            disabled={loadingTicket}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gray-800 hover:bg-gray-900 text-white font-bold rounded-xl text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50"
                          >
                            {loadingTicket ? <Loader2 className="animate-spin" size={16}/> : <Receipt size={16}/>}
                            Ver Ticket de Cierre
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-center text-gray-400">Sin ventas registradas.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {combined.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Wallet size={40} className="mx-auto mb-2 opacity-20" />
            <p>No se encontraron turnos ni cargas manuales en el rango seleccionado.</p>
          </div>
        )}
      </div>

      {/* ── PAGINADOR PREMIUM ── */}
      <div className="border-t border-gray-100 bg-white px-5 py-3 flex flex-col sm:flex-row justify-between items-center gap-3 mt-6">
        <p className="text-xs text-gray-400 whitespace-nowrap">
          Mostrando <span className="font-semibold text-gray-600">{combined.length === 0 ? 0 : indexOfFirst + 1}</span>–<span className="font-semibold text-gray-600">{Math.min(indexOfLast, combined.length)}</span> de <span className="font-semibold text-gray-600">{combined.length}</span> registros
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

      {/* ── MODAL TICKET DE CIERRE ────────────────────────────────────── */}
      {ticketModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden animate-fadeIn">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Receipt size={20} className="text-gray-500" /> Ticket de Cierre
              </h3>
              <button onClick={() => setTicketModal(null)} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-gray-100 p-6 flex justify-center">
              <div id="shift-close-ticket-print" className="bg-white shadow-xl w-full max-w-[320px]">
                <ShiftCloseTicket
                  shiftData={ticketModal.shiftData}
                  salesTotal={ticketModal.salesTotal}
                  expensesTotal={ticketModal.expensesTotal}
                />
              </div>
            </div>
            <div className="p-4 bg-white border-t border-gray-200 space-y-2">
              <button
                onClick={handlePrintCloseTicket}
                className="w-full bg-gray-800 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-lg"
              >
                <Printer size={18} /> IMPRIMIR TICKET
              </button>
              <button
                onClick={() => setTicketModal(null)}
                className="w-full text-gray-400 hover:text-gray-600 font-bold py-2 text-sm transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}