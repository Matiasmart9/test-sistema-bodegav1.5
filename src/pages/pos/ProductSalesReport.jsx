import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  FileBarChart, Calendar, Search, FileSpreadsheet, Loader2,
  Package, ChevronDown, ChevronUp, AlertCircle, Tag
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { todayStrPY, formatDate as fmtDate } from '../../utils/dateUtils';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// ─── Formatters ───────────────────────────────────────────────────────────────
const g = (n) => `₲ ${Math.round(n || 0).toLocaleString('es-PY')}`;
const pct = (n) => `${(n || 0).toFixed(2)}%`;

export default function ProductSalesReport() {
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRows, setExpandedRows] = useState(new Set());

  const [dateRange, setDateRange] = useState({
    start: todayStrPY(),
    end: todayStrPY(),
  });

  const toggleRow = (dateStr) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  // ── Carga y procesamiento ─────────────────────────────────────────────────
  const fetchSalesData = async () => {
    setLoading(true);
    setExpandedRows(new Set());
    try {
      // Parsear con componentes locales para evitar el desfase UTC en Paraguay (UTC-3)
      const [sy, sm, sd] = dateRange.start.split('-').map(Number);
      const [ey, em, ed] = dateRange.end.split('-').map(Number);
      const start = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
      const end = new Date(ey, em - 1, ed, 23, 59, 59, 999);

      const snap = await getDocs(query(collection(db, 'sales'), where('date', '>=', start), where('date', '<=', end)));
      const rawSales = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      const dayMap = {};

      rawSales.forEach(sale => {
        const saleDateObj = sale.date?.toDate ? sale.date.toDate() : new Date(sale.date);
        const dateStr = fmtDate(saleDateObj);
        const dateKey = fmtDate(saleDateObj); // mismo formato para la clave

        if (!dayMap[dateStr]) {
          dayMap[dateStr] = {
            date: dateStr,
            dateKey,
            dateObj: saleDateObj,
            ventasBrutas: 0,
            reembolsos: 0,
            descuentos: 0,
            costoBienes: 0,
            productsMap: {},
            discountsMap: {},   // ← nuevo: mapa de descuentos aplicados ese día
          };
        }

        const day = dayMap[dateStr];
        const isCanceled = sale.status === 'canceled';

        if (isCanceled) {
          day.reembolsos += parseFloat(sale.total || 0);
        } else {
          const rawSubTotal = sale.subTotal != null
            ? parseFloat(sale.subTotal)
            : parseFloat(sale.total || 0) + parseFloat(sale.discountTotal || 0);

          day.ventasBrutas += rawSubTotal;
          day.descuentos += parseFloat(sale.discountTotal || 0);

          // ── Costo de bienes + detalle por producto ────────────────────
          if (Array.isArray(sale.items)) {
            sale.items.forEach(item => {
              const qty = parseFloat(item.quantity || 0);
              const price = parseFloat(item.price || 0);
              const cost = parseFloat(item.cost || 0);
              const revenue = qty * price;
              const itemCost = qty * cost;

              day.costoBienes += itemCost;

              const pName = item.name || 'Sin nombre';
              if (!day.productsMap[pName]) {
                day.productsMap[pName] = { name: pName, quantity: 0, revenue: 0, cost: 0 };
              }
              day.productsMap[pName].quantity += qty;
              day.productsMap[pName].revenue += revenue;
              day.productsMap[pName].cost += itemCost;
            });
          }

          // ── Descuentos aplicados (por nombre) ─────────────────────────
          if (Array.isArray(sale.appliedDiscounts) && sale.appliedDiscounts.length > 0) {
            sale.appliedDiscounts.forEach(disc => {
              const key = disc.id || disc.name || 'Descuento';

              // Calcular monto real de este descuento en esta venta
              let amount = 0;
              if (disc.type === 'fixed') {
                amount = (disc.value || 0) * (disc.quantity || 1);
              } else {
                // porcentaje: sobre el subtotal de esa venta
                amount = (rawSubTotal * ((disc.value || 0) / 100)) * (disc.quantity || 1);
              }

              if (!day.discountsMap[key]) {
                day.discountsMap[key] = {
                  name: disc.name || 'Descuento',
                  type: disc.type,
                  value: disc.value,
                  totalAmount: 0,
                  times: 0,          // cuántas veces se aplicó
                };
              }
              day.discountsMap[key].totalAmount += amount;
              day.discountsMap[key].times += (disc.quantity || 1);
            });
          }
        }
      });

      // Calcular campos derivados
      const result = Object.values(dayMap).map(day => {
        const ventasNetas = Math.max(0, day.ventasBrutas - day.descuentos - day.reembolsos);
        const beneficioBruto = ventasNetas - day.costoBienes;
        const margen = ventasNetas > 0 ? (beneficioBruto / ventasNetas) * 100 : 0;

        const products = Object.values(day.productsMap)
          .map(p => ({ ...p, profit: p.revenue - p.cost }))
          .sort((a, b) => b.revenue - a.revenue);

        const discounts = Object.values(day.discountsMap)
          .sort((a, b) => b.totalAmount - a.totalAmount);

        const { productsMap, discountsMap, ...rest } = day;
        return { ...rest, ventasNetas, beneficioBruto, margen, products, discounts };
      }).sort((a, b) => b.dateKey.localeCompare(a.dateKey));

      setReportData(result);
    } catch (error) {
      console.error('Error cargando reporte:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSalesData(); }, [dateRange]); // eslint-disable-line

  // ── Filtrado ──────────────────────────────────────────────────────────────
  const filteredData = searchTerm.trim()
    ? reportData.filter(day =>
      day.products.some(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    : reportData;

  // ── Totales generales ─────────────────────────────────────────────────────
  const totals = filteredData.reduce((acc, day) => ({
    ventasBrutas: acc.ventasBrutas + day.ventasBrutas,
    reembolsos: acc.reembolsos + day.reembolsos,
    descuentos: acc.descuentos + day.descuentos,
    ventasNetas: acc.ventasNetas + day.ventasNetas,
    costoBienes: acc.costoBienes + day.costoBienes,
    beneficioBruto: acc.beneficioBruto + day.beneficioBruto,
  }), { ventasBrutas: 0, reembolsos: 0, descuentos: 0, ventasNetas: 0, costoBienes: 0, beneficioBruto: 0 });

  const totalMargen = totals.ventasNetas > 0 ? (totals.beneficioBruto / totals.ventasNetas) * 100 : 0;

  // ── Exportar Excel ────────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    const wb = XLSX.utils.book_new();

    // Hoja 1: Resumen por día
    const summaryRows = filteredData.map(day => ({
      'Fecha': day.date,
      'Ventas Brutas (₲)': Math.round(day.ventasBrutas),
      'Reembolsos (₲)': Math.round(day.reembolsos),
      'Descuentos (₲)': Math.round(day.descuentos),
      'Ventas Netas (₲)': Math.round(day.ventasNetas),
      'Costo de Bienes (₲)': Math.round(day.costoBienes),
      'Beneficio Bruto (₲)': Math.round(day.beneficioBruto),
      'Margen %': parseFloat(day.margen.toFixed(2)),
    }));
    summaryRows.push({
      'Fecha': 'TOTAL',
      'Ventas Brutas (₲)': Math.round(totals.ventasBrutas),
      'Reembolsos (₲)': Math.round(totals.reembolsos),
      'Descuentos (₲)': Math.round(totals.descuentos),
      'Ventas Netas (₲)': Math.round(totals.ventasNetas),
      'Costo de Bienes (₲)': Math.round(totals.costoBienes),
      'Beneficio Bruto (₲)': Math.round(totals.beneficioBruto),
      'Margen %': parseFloat(totalMargen.toFixed(2)),
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Resumen por Día');

    // Hoja 2: Detalle por producto
    const detailRows = [];
    filteredData.forEach(day => {
      const productsToShow = searchTerm
        ? day.products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
        : day.products;
      productsToShow.forEach(p => {
        detailRows.push({
          'Fecha': day.date,
          'Producto': p.name,
          'Cantidad Vendida': parseFloat(p.quantity.toFixed(3)),
          'Ingresos (₲)': Math.round(p.revenue),
          'Costo (₲)': Math.round(p.cost),
          'Ganancia (₲)': Math.round(p.profit),
          'Margen %': p.revenue > 0 ? parseFloat(((p.profit / p.revenue) * 100).toFixed(2)) : 0,
        });
      });
      // Agregar descuentos de ese día al detalle
      if (day.discounts.length > 0) {
        day.discounts.forEach(d => {
          detailRows.push({
            'Fecha': day.date,
            'Producto': `[DESCUENTO] ${d.name}`,
            'Cantidad Vendida': d.times,
            'Ingresos (₲)': 0,
            'Costo (₲)': 0,
            'Ganancia (₲)': -Math.round(d.totalAmount),
            'Margen %': '',
          });
        });
      }
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), 'Detalle Productos');

    const fileName = `Reporte_Ventas_${dateRange.start}_${dateRange.end}.xlsx`;

    if (Capacitor.isNativePlatform()) {
      try {
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        const saveResult = await Filesystem.writeFile({ path: fileName, data: wbout, directory: Directory.Cache });
        await Share.share({ title: 'Reporte de Ventas', url: saveResult.uri, dialogTitle: 'Descargar Reporte' });
      } catch (e) { console.error('Error exportando:', e); }
    } else {
      XLSX.writeFile(wb, fileName);
    }
  };

  // ── Clases reutilizables ──────────────────────────────────────────────────
  const TH = 'px-3 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap';
  const TD = 'px-3 py-4 text-right';

  return (
    <div className="max-w-7xl mx-auto pb-20">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FileBarChart className="text-purple-600" /> Reporte Financiero de Ventas V2.4
          </h1>
          <p className="text-sm text-gray-500">
            Detalle de ventas por fecha — margen, costo de bienes y reembolsos.
          </p>
        </div>

        {/* KPI rápidos */}
        <div className="flex gap-3 flex-wrap">
          <div className="bg-green-50 border border-green-100 px-4 py-2.5 rounded-xl">
            <p className="text-[9px] font-bold text-green-500 uppercase tracking-wider">Ventas Netas</p>
            <p className="text-lg font-black text-green-700 leading-tight">{g(totals.ventasNetas)}</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 px-4 py-2.5 rounded-xl">
            <p className="text-[9px] font-bold text-blue-500 uppercase tracking-wider">Beneficio Bruto</p>
            <p className="text-lg font-black text-blue-700 leading-tight">{g(totals.beneficioBruto)}</p>
          </div>
          <div className={`border px-4 py-2.5 rounded-xl
            ${totalMargen >= 15 ? 'bg-emerald-50 border-emerald-100' :
              totalMargen >= 10 ? 'bg-yellow-50 border-yellow-100' : 'bg-orange-50 border-orange-100'}`}>
            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Margen Total</p>
            <p className={`text-lg font-black leading-tight
              ${totalMargen >= 15 ? 'text-emerald-700' : totalMargen >= 10 ? 'text-yellow-700' : 'text-orange-700'}`}>
              {pct(totalMargen)}
            </p>
          </div>
        </div>
      </div>

      {/* ── TOOLBAR ────────────────────────────────────────────────────── */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6
                      flex flex-col lg:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-lg border border-gray-200 w-full lg:w-auto">
          <Calendar size={17} className="text-gray-400 shrink-0" />
          <input type="date" value={dateRange.start}
            onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))}
            className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none" />
          <span className="text-gray-400">—</span>
          <input type="date" value={dateRange.end}
            onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))}
            className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none" />
        </div>

        <div className="relative flex-1 w-full lg:max-w-xs">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={17} />
          <input type="text" placeholder="Filtrar por producto..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm
                       bg-gray-50 focus:bg-white focus:outline-none focus:border-purple-400" />
        </div>

        <button onClick={handleExportExcel}
          disabled={loading || filteredData.length === 0}
          className="flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-lg
                     font-bold hover:bg-green-700 transition-colors shadow-sm whitespace-nowrap disabled:opacity-50">
          <FileSpreadsheet size={18} /> Exportar Excel
        </button>
      </div>

      {/* ── TABLA PRINCIPAL ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="animate-spin text-purple-500" size={40} />
            <p className="text-sm text-gray-400">Procesando reporte...</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3">
            <Package size={40} className="opacity-20" />
            <p>No hay ventas registradas en el período seleccionado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50 border-b-2 border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-36 whitespace-nowrap">Fecha</th>
                  <th className={TH}>Ventas brutas</th>
                  <th className={TH}>Reembolsos</th>
                  <th className={TH}>Descuentos</th>
                  <th className={TH}>Ventas netas</th>
                  <th className={TH}>Costo de bienes</th>
                  <th className={TH}>Beneficio bruto</th>
                  <th className={TH}>Margen</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {filteredData.map(day => {
                  const isExpanded = expandedRows.has(day.date);
                  const filteredProds = searchTerm
                    ? day.products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
                    : day.products;
                  const hasDiscounts = day.discounts.length > 0;

                  return (
                    <React.Fragment key={day.date}>

                      {/* ── FILA FECHA ──────────────────────────────── */}
                      <tr onClick={() => toggleRow(day.date)}
                        className={`cursor-pointer transition-colors select-none
                          ${isExpanded ? 'bg-purple-50/50' : 'hover:bg-gray-50/80'}`}>
                        <td className="px-4 py-4 font-bold text-gray-800 whitespace-nowrap">{day.date}</td>
                        <td className={`${TD} text-gray-700 font-medium`}>{g(day.ventasBrutas)}</td>
                        <td className={`${TD} font-medium ${day.reembolsos > 0 ? 'text-red-600 font-bold' : 'text-gray-400'}`}>{g(day.reembolsos)}</td>
                        <td className={`${TD} font-medium ${day.descuentos > 0 ? 'text-orange-600 font-bold' : 'text-gray-400'}`}>{g(day.descuentos)}</td>
                        <td className={`${TD} font-bold text-gray-900`}>{g(day.ventasNetas)}</td>
                        <td className={`${TD} text-gray-600`}>{g(day.costoBienes)}</td>
                        <td className={`${TD} font-bold ${day.beneficioBruto >= 0 ? 'text-green-600' : 'text-red-600'}`}>{g(day.beneficioBruto)}</td>
                        <td className={`${TD} font-black text-base
                          ${day.margen >= 15 ? 'text-green-600' : day.margen >= 10 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {pct(day.margen)}
                        </td>
                        <td className="px-4 py-4 text-center text-gray-400">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </td>
                      </tr>

                      {/* ── FILA EXPANDIDA ──────────────────────────── */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} className="p-0 border-b border-gray-100">
                            <div className="bg-slate-50 pl-10 pr-4 py-4 space-y-4">

                              {/* TABLA DE PRODUCTOS */}
                              {filteredProds.length === 0 ? (
                                <p className="text-center text-xs text-gray-400 italic py-2">
                                  No hay productos con ese filtro para esta fecha.
                                </p>
                              ) : (
                                <div>
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                    <Package size={11} /> Productos vendidos
                                  </p>
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-gray-500 font-bold uppercase border-b border-gray-200 text-[10px]">
                                        <th className="text-left pb-2 pl-2 tracking-wider">Producto</th>
                                        <th className="text-right pb-2 tracking-wider">Cantidad</th>
                                        <th className="text-right pb-2 tracking-wider">Ingresos</th>
                                        <th className="text-right pb-2 tracking-wider">Costo</th>
                                        <th className="text-right pb-2 tracking-wider">Ganancia</th>
                                        <th className="text-right pb-2 tracking-wider">Margen</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {filteredProds.map((p, idx) => {
                                        const pm = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
                                        return (
                                          <tr key={idx} className="hover:bg-white transition-colors">
                                            <td className="py-2 pl-2 font-medium text-gray-700 pr-4">{p.name}</td>
                                            <td className="py-2 text-right">
                                              <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">
                                                {parseFloat(p.quantity).toLocaleString('es-PY', { maximumFractionDigits: 3 })}
                                              </span>
                                            </td>
                                            <td className="py-2 text-right text-gray-700 font-medium">{g(p.revenue)}</td>
                                            <td className="py-2 text-right text-gray-500">{g(p.cost)}</td>
                                            <td className={`py-2 text-right font-bold ${p.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{g(p.profit)}</td>
                                            <td className={`py-2 text-right font-bold
                                              ${pm >= 15 ? 'text-green-600' : pm >= 10 ? 'text-yellow-600' : 'text-red-500'}`}>
                                              {pct(pm)}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* ── SECCIÓN DESCUENTOS APLICADOS ───── */}
                              {hasDiscounts && (
                                <div>
                                  <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                    <Tag size={11} /> Descuentos aplicados en este día
                                  </p>
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-gray-500 font-bold uppercase border-b border-orange-100 text-[10px]">
                                        <th className="text-left pb-2 pl-2 tracking-wider">Nombre del Descuento</th>
                                        <th className="text-right pb-2 tracking-wider">Tipo</th>
                                        <th className="text-right pb-2 tracking-wider">Veces Aplicado</th>
                                        <th className="text-right pb-2 tracking-wider">Total Descontado</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-orange-50">
                                      {day.discounts.map((d, idx) => (
                                        <tr key={idx} className="hover:bg-orange-50/50 transition-colors">
                                          <td className="py-2 pl-2 font-bold text-gray-700 flex items-center gap-2">
                                            <Tag size={11} className="text-orange-400 shrink-0" />
                                            {d.name}
                                          </td>
                                          <td className="py-2 text-right">
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold
                                              ${d.type === 'percentage'
                                                ? 'bg-blue-100 text-blue-700'
                                                : 'bg-orange-100 text-orange-700'}`}>
                                              {d.type === 'percentage' ? `${d.value}%` : 'Monto fijo'}
                                            </span>
                                          </td>
                                          <td className="py-2 text-right text-gray-600 font-medium">{d.times}x</td>
                                          <td className="py-2 text-right font-black text-orange-600">
                                            − {g(d.totalAmount)}
                                          </td>
                                        </tr>
                                      ))}
                                      {/* Subtotal de descuentos del día */}
                                      <tr className="bg-orange-50/70 border-t-2 border-orange-100">
                                        <td colSpan={3} className="py-2 pl-2 font-black text-orange-700 text-right pr-4">
                                          Total descontado el {day.date}:
                                        </td>
                                        <td className="py-2 text-right font-black text-orange-700">
                                          − {g(day.descuentos)}
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              )}

                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* ── FILA TOTALES ──────────────────────────────── */}
                <tr className="bg-gray-900 text-white">
                  <td className="px-4 py-4 font-black text-sm tracking-wide">TOTALES</td>
                  <td className={`${TD} text-sm font-bold text-gray-200`}>{g(totals.ventasBrutas)}</td>
                  <td className={`${TD} text-sm font-bold ${totals.reembolsos > 0 ? 'text-red-300' : 'text-gray-500'}`}>{g(totals.reembolsos)}</td>
                  <td className={`${TD} text-sm font-bold ${totals.descuentos > 0 ? 'text-orange-300' : 'text-gray-500'}`}>{g(totals.descuentos)}</td>
                  <td className={`${TD} text-sm font-black text-green-300`}>{g(totals.ventasNetas)}</td>
                  <td className={`${TD} text-sm font-bold text-gray-400`}>{g(totals.costoBienes)}</td>
                  <td className={`${TD} text-sm font-black text-green-300`}>{g(totals.beneficioBruto)}</td>
                  <td className={`${TD} text-sm font-black text-yellow-300`}>{pct(totalMargen)}</td>
                  <td className="px-4 py-4" />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── NOTA ─────────────────────────────────────────────────────── */}
      {!loading && filteredData.length > 0 && (
        <div className="mt-4 flex items-start gap-2 text-xs text-gray-400 bg-gray-50 p-3 rounded-lg border border-gray-200">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p><strong>Clic en cualquier fila</strong> para ver el desglose de productos y los descuentos aplicados ese día.</p>
            <p>Los <strong>descuentos</strong> se muestran con nombre, tipo y cuántas veces se aplicaron.</p>
            <p><strong>Reembolsos</strong> corresponden a ventas anuladas en ese período.</p>
          </div>
        </div>
      )}
    </div>
  );
}