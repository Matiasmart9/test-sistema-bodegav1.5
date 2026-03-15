import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  Users, Calendar, FileSpreadsheet, Loader2,
  ChevronDown, ChevronUp, TrendingUp, ShoppingBag,
  Receipt, Tag, BarChart2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const g     = (n) => `₲ ${Math.round(n || 0).toLocaleString('es-PY')}`;
const pct   = (n) => `${(n || 0).toFixed(1)}%`;
const today = () => new Date().toISOString().split('T')[0];

const PAYMENT_LABELS = {
  cash:     'Efectivo',
  qr:       'QR',
  card:     'Tarjeta',
  transfer: 'Transferencia',
};

export default function CashierReport() {
  const [reportData,   setReportData]   = useState([]);   // [{ cashierName, cashierId, ... }]
  const [loading,      setLoading]      = useState(false);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [dateRange,    setDateRange]    = useState({
    start: today(),
    end:   today(),
  });

  // ── Fetch & procesar ───────────────────────────────────────────────────────
  const fetchReport = useCallback(async () => {
    setLoading(true);
    setExpandedRows(new Set());
    try {
      const [sy, sm, sd] = dateRange.start.split('-').map(Number);
      const [ey, em, ed] = dateRange.end.split('-').map(Number);
      const start = new Date(sy, sm - 1, sd,  0,  0,  0,   0);
      const end   = new Date(ey, em - 1, ed, 23, 59, 59, 999);

      const snap = await getDocs(
        query(collection(db, 'sales'),
          where('date', '>=', start),
          where('date', '<=', end)
        )
      );
      const sales = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Agrupar por cajero
      const cashierMap = {};
      sales.forEach(sale => {
        const key  = sale.userId  || sale.userName || 'Desconocido';
        const name = sale.userName || 'Desconocido';

        if (!cashierMap[key]) {
          cashierMap[key] = {
            cashierId:     key,
            cashierName:   name,
            tickets:       0,
            canceledTickets: 0,
            grossSales:    0,
            discounts:     0,
            netSales:      0,
            costOfGoods:   0,
            grossProfit:   0,
            paymentBreakdown: { cash: 0, qr: 0, card: 0, transfer: 0 },
            topProducts:   {},  // { name: { qty, revenue } }
            dailyMap:      {},  // { 'dd/mm/yy': { tickets, net } }
          };
        }

        const c          = cashierMap[key];
        const isCanceled = sale.status === 'canceled';

        if (isCanceled) {
          c.canceledTickets++;
          return;
        }

        const subTotal     = parseFloat(sale.subTotal ?? (parseFloat(sale.total || 0) + parseFloat(sale.discountTotal || 0)));
        const discountAmt  = parseFloat(sale.discountTotal || 0);
        const net          = parseFloat(sale.total || 0);
        const pm           = sale.paymentMethod || 'cash';

        c.tickets++;
        c.grossSales  += subTotal;
        c.discounts   += discountAmt;
        c.netSales    += net;
        if (c.paymentBreakdown[pm] !== undefined) c.paymentBreakdown[pm] += net;

        // Costo de bienes + top productos
        if (Array.isArray(sale.items)) {
          sale.items.forEach(item => {
            const qty      = parseFloat(item.quantity || 0);
            const cost     = parseFloat(item.cost     || 0);
            const revenue  = qty * parseFloat(item.price || 0);
            c.costOfGoods += qty * cost;

            const pName = item.name || 'Sin nombre';
            if (!c.topProducts[pName]) c.topProducts[pName] = { qty: 0, revenue: 0 };
            c.topProducts[pName].qty     += qty;
            c.topProducts[pName].revenue += revenue;
          });
        }

        // Resumen por día
        const dateObj = sale.date?.toDate ? sale.date.toDate() : new Date(sale.date);
        const dKey    = dateObj.toLocaleDateString('es-PY');
        if (!c.dailyMap[dKey]) c.dailyMap[dKey] = { tickets: 0, net: 0, dateObj };
        c.dailyMap[dKey].tickets++;
        c.dailyMap[dKey].net += net;
      });

      // Derivar campos calculados y ordenar
      const result = Object.values(cashierMap).map(c => ({
        ...c,
        grossProfit:    c.netSales - c.costOfGoods,
        margin:         c.netSales > 0 ? ((c.netSales - c.costOfGoods) / c.netSales) * 100 : 0,
        avgTicket:      c.tickets > 0 ? c.netSales / c.tickets : 0,
        topProductsList: Object.entries(c.topProducts)
          .map(([name, v]) => ({ name, ...v }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5),
        dailyList: Object.values(c.dailyMap)
          .sort((a, b) => a.dateObj - b.dateObj),
      })).sort((a, b) => b.netSales - a.netSales);

      setReportData(result);
    } catch (e) {
      console.error('Error cargando reporte:', e);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  // ── Totales generales ──────────────────────────────────────────────────────
  const totals = reportData.reduce((acc, c) => ({
    tickets:     acc.tickets     + c.tickets,
    netSales:    acc.netSales    + c.netSales,
    discounts:   acc.discounts   + c.discounts,
    grossProfit: acc.grossProfit + c.grossProfit,
  }), { tickets: 0, netSales: 0, discounts: 0, grossProfit: 0 });

  const totalMargin = totals.netSales > 0 ? (totals.grossProfit / totals.netSales) * 100 : 0;

  // ── Expandir ───────────────────────────────────────────────────────────────
  const toggle = (id) => setExpandedRows(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // ── Exportar Excel ─────────────────────────────────────────────────────────
  const handleExport = async () => {
    const wb = XLSX.utils.book_new();

    // Hoja 1: Resumen por cajero
    const summary = reportData.map(c => ({
      Cajero:              c.cashierName,
      Tickets:             c.tickets,
      'Cancelados':        c.canceledTickets,
      'Ventas Brutas (₲)': Math.round(c.grossSales),
      'Descuentos (₲)':    Math.round(c.discounts),
      'Ventas Netas (₲)':  Math.round(c.netSales),
      'Ticket Promedio (₲)': Math.round(c.avgTicket),
      'Costo Bienes (₲)':  Math.round(c.costOfGoods),
      'Ganancia Bruta (₲)': Math.round(c.grossProfit),
      'Margen %':          parseFloat(c.margin.toFixed(2)),
      'Efectivo (₲)':      Math.round(c.paymentBreakdown.cash),
      'QR (₲)':            Math.round(c.paymentBreakdown.qr),
      'Tarjeta (₲)':       Math.round(c.paymentBreakdown.card),
      'Transferencia (₲)': Math.round(c.paymentBreakdown.transfer),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Resumen Cajeros');

    // Hoja 2: Detalle por día por cajero
    const daily = [];
    reportData.forEach(c => {
      c.dailyList.forEach(d => {
        daily.push({
          Cajero:     c.cashierName,
          Fecha:      d.dateObj.toLocaleDateString('es-PY'),
          Tickets:    d.tickets,
          'Ventas (₲)': Math.round(d.net),
        });
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(daily), 'Detalle por Día');

    const fileName = `Reporte_Cajeros_${dateRange.start}_${dateRange.end}.xlsx`;

    if (Capacitor.isNativePlatform()) {
      try {
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        const res   = await Filesystem.writeFile({ path: fileName, data: wbout, directory: Directory.Cache });
        await Share.share({ title: 'Reporte de Cajeros', url: res.uri, dialogTitle: 'Descargar' });
      } catch (e) { console.error(e); }
    } else {
      XLSX.writeFile(wb, fileName);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto pb-20">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Users className="text-emerald-600" size={26}/>
            Reporte de Ventas por Cajero
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Rendimiento individual de cada cajero en el período seleccionado.
          </p>
        </div>

        {/* KPIs rápidos */}
        <div className="flex gap-3 flex-wrap">
          <div className="bg-emerald-50 border border-emerald-100 px-4 py-2.5 rounded-xl">
            <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider">Ventas Totales</p>
            <p className="text-lg font-black text-emerald-700 leading-tight">{g(totals.netSales)}</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 px-4 py-2.5 rounded-xl">
            <p className="text-[9px] font-bold text-blue-500 uppercase tracking-wider">Tickets Emitidos</p>
            <p className="text-lg font-black text-blue-700 leading-tight">{totals.tickets}</p>
          </div>
          <div className="bg-orange-50 border border-orange-100 px-4 py-2.5 rounded-xl">
            <p className="text-[9px] font-bold text-orange-500 uppercase tracking-wider">Descuentos</p>
            <p className="text-lg font-black text-orange-700 leading-tight">{g(totals.discounts)}</p>
          </div>
          <div className={`border px-4 py-2.5 rounded-xl
            ${totalMargin >= 15 ? 'bg-green-50 border-green-100' : totalMargin >= 10 ? 'bg-yellow-50 border-yellow-100' : 'bg-red-50 border-red-100'}`}>
            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Margen Global</p>
            <p className={`text-lg font-black leading-tight
              ${totalMargin >= 15 ? 'text-green-700' : totalMargin >= 10 ? 'text-yellow-700' : 'text-red-600'}`}>
              {pct(totalMargin)}
            </p>
          </div>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6
                      flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-lg border border-gray-200 w-full sm:w-auto">
          <Calendar size={17} className="text-gray-400 shrink-0"/>
          <input type="date" value={dateRange.start}
            onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))}
            className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none"/>
          <span className="text-gray-400">—</span>
          <input type="date" value={dateRange.end}
            onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))}
            className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none"/>
        </div>
        <button onClick={handleExport}
          disabled={loading || reportData.length === 0}
          className="flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-lg
                     font-bold hover:bg-green-700 transition-colors shadow-sm whitespace-nowrap disabled:opacity-50">
          <FileSpreadsheet size={18}/> Exportar Excel
        </button>
      </div>

      {/* TABLA */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="animate-spin text-emerald-500" size={40}/>
          <p className="text-sm text-gray-400">Procesando reporte...</p>
        </div>
      ) : reportData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3 bg-white rounded-xl border border-gray-200">
          <BarChart2 size={40} className="opacity-20"/>
          <p>No hay ventas registradas en el período seleccionado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reportData.map((cashier, idx) => {
            const isExpanded = expandedRows.has(cashier.cashierId);
            const rankColors = ['text-yellow-500', 'text-gray-400', 'text-amber-600'];

            return (
              <div key={cashier.cashierId}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all
                  ${isExpanded ? 'border-emerald-300 shadow-md' : 'border-gray-200'}`}>

                {/* ── FILA CAJERO ──────────────────────────────────── */}
                <div onClick={() => toggle(cashier.cashierId)}
                  className="p-5 flex flex-col md:flex-row gap-4 items-center justify-between cursor-pointer hover:bg-gray-50/80 select-none">

                  {/* Avatar + nombre */}
                  <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative shrink-0">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl font-black">
                        {cashier.cashierName.charAt(0).toUpperCase()}
                      </div>
                      {idx < 3 && (
                        <span className={`absolute -top-1 -right-1 text-lg ${rankColors[idx]}`}>
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800 text-base">{cashier.cashierName}</h3>
                      <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Receipt size={11}/> {cashier.tickets} tickets
                        </span>
                        {cashier.canceledTickets > 0 && (
                          <span className="text-red-400">{cashier.canceledTickets} cancelados</span>
                        )}
                        <span className="flex items-center gap-1">
                          <ShoppingBag size={11}/> Promedio {g(cashier.avgTicket)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* KPIs inline */}
                  <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                    {cashier.discounts > 0 && (
                      <div className="text-right hidden sm:block">
                        <p className="text-[9px] font-bold text-orange-400 uppercase tracking-wider">Descuentos</p>
                        <p className="font-bold text-orange-500 text-sm">− {g(cashier.discounts)}</p>
                      </div>
                    )}
                    <div className="text-right">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Ventas Netas</p>
                      <p className="font-black text-lg text-gray-900">{g(cashier.netSales)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider">Ganancia</p>
                      <p className="font-bold text-emerald-600 text-base">{g(cashier.grossProfit)}</p>
                    </div>
                    <div className={`text-right px-3 py-1.5 rounded-lg
                      ${cashier.margin >= 15 ? 'bg-green-50' : cashier.margin >= 10 ? 'bg-yellow-50' : 'bg-red-50'}`}>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Margen</p>
                      <p className={`font-black text-base
                        ${cashier.margin >= 15 ? 'text-green-600' : cashier.margin >= 10 ? 'text-yellow-600' : 'text-red-500'}`}>
                        {pct(cashier.margin)}
                      </p>
                    </div>
                    <span className="text-gray-400 ml-2">
                      {isExpanded ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                    </span>
                  </div>
                </div>

                {/* ── DETALLE EXPANDIDO ─────────────────────────────── */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-5 bg-gray-50/50 animate-fadeIn">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                      {/* Métodos de pago */}
                      <div className="bg-white rounded-xl border border-gray-100 p-4">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                          Métodos de Pago
                        </h4>
                        <div className="space-y-2">
                          {Object.entries(cashier.paymentBreakdown).map(([key, val]) => (
                            val > 0 && (
                              <div key={key} className="flex justify-between items-center text-sm">
                                <span className="text-gray-500">{PAYMENT_LABELS[key] || key}</span>
                                <span className="font-bold text-gray-800">{g(val)}</span>
                              </div>
                            )
                          ))}
                          {Object.values(cashier.paymentBreakdown).every(v => v === 0) && (
                            <p className="text-xs text-gray-400 italic">Sin desglose disponible</p>
                          )}
                        </div>
                      </div>

                      {/* Top 5 productos */}
                      <div className="bg-white rounded-xl border border-gray-100 p-4">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                          Top 5 Productos
                        </h4>
                        {cashier.topProductsList.length === 0 ? (
                          <p className="text-xs text-gray-400 italic">Sin datos</p>
                        ) : (
                          <div className="space-y-2">
                            {cashier.topProductsList.map((p, i) => (
                              <div key={i} className="flex justify-between items-center text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="shrink-0 w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-[9px]">
                                    {i + 1}
                                  </span>
                                  <span className="text-gray-700 truncate font-medium">{p.name}</span>
                                </div>
                                <div className="text-right shrink-0 ml-2">
                                  <span className="font-bold text-gray-800">{g(p.revenue)}</span>
                                  <span className="text-gray-400 ml-1">({p.qty.toLocaleString('es-PY', {maximumFractionDigits: 1})}u)</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Ventas por día */}
                      <div className="bg-white rounded-xl border border-gray-100 p-4">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                          Ventas por Día
                        </h4>
                        {cashier.dailyList.length === 0 ? (
                          <p className="text-xs text-gray-400 italic">Sin datos</p>
                        ) : (
                          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                            {cashier.dailyList.map((d, i) => (
                              <div key={i} className="flex justify-between items-center text-xs">
                                <span className="text-gray-500">{d.dateObj.toLocaleDateString('es-PY')}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-400">{d.tickets} tickets</span>
                                  <span className="font-bold text-gray-800">{g(d.net)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Fila totales */}
          <div className="bg-slate-900 text-white rounded-xl p-5 flex flex-col md:flex-row justify-between items-center gap-3">
            <span className="font-black text-sm tracking-wide uppercase">Totales del período</span>
            <div className="flex gap-8 flex-wrap justify-end">
              <div className="text-right">
                <p className="text-[9px] text-slate-400 uppercase tracking-wider">Tickets</p>
                <p className="font-black text-lg">{totals.tickets}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-orange-300 uppercase tracking-wider">Descuentos</p>
                <p className="font-bold text-orange-300">− {g(totals.discounts)}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-slate-400 uppercase tracking-wider">Ventas Netas</p>
                <p className="font-black text-lg text-green-300">{g(totals.netSales)}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-slate-400 uppercase tracking-wider">Ganancia</p>
                <p className="font-black text-lg text-emerald-300">{g(totals.grossProfit)}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-slate-400 uppercase tracking-wider">Margen</p>
                <p className={`font-black text-lg ${totalMargin >= 15 ? 'text-green-300' : totalMargin >= 10 ? 'text-yellow-300' : 'text-red-300'}`}>
                  {pct(totalMargin)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}