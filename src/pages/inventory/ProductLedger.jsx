import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { sileo } from 'sileo';
import XLSX from 'xlsx-js-style';
import {
  FileSpreadsheet, Search, Calendar, ClipboardList, Package,
  ChevronDown, ChevronUp, ArrowDownCircle, ArrowUpCircle, RefreshCcw, Loader2,
} from 'lucide-react';
import { formatDateTime } from '../../utils/dateUtils';
import ConfirmModal from '../../components/ui/ConfirmModal';

const g = (n) => `₲ ${Math.round(n || 0).toLocaleString('es-PY')}`;

// Pinta la primera fila (encabezados) de una hoja con el verde de marca
const styleHeaderRow = (ws) => {
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) {
      cell.s = {
        fill: { fgColor: { rgb: '10B981' } },
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        alignment: { horizontal: 'center', vertical: 'center' },
      };
    }
  }
};

// Marca las deudas de stock que ya existía antes de usar Entrada Mercadería
const INITIAL_STOCK_SUPPLIER = 'Stock inicial (mercadería existente)';

export default function ProductLedger() {
  const [batches,  setBatches]  = useState([]);
  const [sales,    setSales]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);

  const [search,    setSearch]    = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd,   setDateEnd]   = useState('');
  const [expanded,  setExpanded]  = useState(new Set());

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [batchesSnap, salesSnap] = await Promise.all([
        getDocs(query(collection(db, 'inventory_batches'), orderBy('entryDate', 'desc'))),
        getDocs(collection(db, 'sales')),
      ]);

      setBatches(batchesSnap.docs.map(d => {
        const b = d.data();
        return { id: d.id, ...b, entryDateObj: b.entryDate?.toDate ? b.entryDate.toDate() : new Date(b.entryDate) };
      }));

      setSales(salesSnap.docs
        .map(d => {
          const s = d.data();
          return { id: d.id, ...s, dateObj: s.date?.toDate ? s.date.toDate() : new Date(s.date) };
        })
        .filter(s => s.status !== 'canceled'));
    } catch (e) {
      console.error('Error cargando ficha de mercaderías:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // ── Reconciliar stock inicial: crea un lote para la mercadería que ya
  // existía antes de usar Entrada Mercadería, para que el stock de la ficha
  // coincida con el de Lista de Productos. Usa el costo actual del producto
  // como aproximación (no hay costo real de esa compra) y una fecha anterior
  // a cualquier lote real, para que se consuma primero en el FIFO. ──────────
  const runReconciliation = async () => {
    setReconciling(true);
    try {
      const [batchesSnap, productsSnap] = await Promise.all([
        getDocs(collection(db, 'inventory_batches')),
        getDocs(collection(db, 'products')),
      ]);

      const freshBatches = batchesSnap.docs.map(d => {
        const b = d.data();
        return { ...b, entryDateObj: b.entryDate?.toDate ? b.entryDate.toDate() : new Date(b.entryDate) };
      });
      const freshProducts = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Ancla: un día antes del lote real más antiguo (o una fecha fija si no hay ninguno)
      const anchor = freshBatches.length
        ? new Date(Math.min(...freshBatches.map(b => b.entryDateObj.getTime())) - 24 * 60 * 60 * 1000)
        : new Date(2020, 0, 1);

      // Stock remanente por lotes existentes, agrupado por producto/variante
      const remainingByKey = {};
      freshBatches.forEach(b => {
        const key = `${b.productId}|${b.variantIndex ?? 'null'}`;
        remainingByKey[key] = (remainingByKey[key] || 0) + (parseFloat(b.qtyRemaining) || 0);
      });

      // Unidades a reconciliar: producto simple o cada variante activa
      const units = [];
      freshProducts.forEach(p => {
        if (p.variants && p.variants.length > 0) {
          p.variants.forEach((v, idx) => {
            units.push({
              productId: p.id, variantIndex: idx,
              productName: `${p.name} / ${v.name}`,
              stock: parseFloat(v.stock) || 0,
              cost: parseFloat(v.cost) || 0,
            });
          });
        } else {
          units.push({
            productId: p.id, variantIndex: null,
            productName: p.name,
            stock: parseFloat(p.current_stock) || 0,
            cost: parseFloat(p.cost) || 0,
          });
        }
      });

      const toCreate = units
        .map(u => {
          const key = `${u.productId}|${u.variantIndex ?? 'null'}`;
          const deficit = u.stock - (remainingByKey[key] || 0);
          return { ...u, deficit };
        })
        .filter(u => u.deficit > 0.0001);

      if (toCreate.length === 0) {
        sileo.success({ title: 'No hay nada para reconciliar.', description: 'El stock de todos los productos ya coincide con sus lotes.' });
        return;
      }

      // Escribir en tandas de 450 (límite de Firestore es 500 por batch)
      for (let i = 0; i < toCreate.length; i += 450) {
        const chunk = toCreate.slice(i, i + 450);
        const wb = writeBatch(db);
        chunk.forEach(u => {
          const ref = doc(collection(db, 'inventory_batches'));
          wb.set(ref, {
            productId:    u.productId,
            variantIndex: u.variantIndex,
            productName:  u.productName,
            qtyOriginal:  u.deficit,
            qtyRemaining: u.deficit,
            unitCost:     u.cost,
            supplier:     INITIAL_STOCK_SUPPLIER,
            invoiceNo:    null,
            entryDate:    anchor,
            stockEntryId: null,
            isInitialStock: true,
            createdAt:    new Date(),
          });
        });
        await wb.commit();
      }

      const totalValor = toCreate.reduce((acc, u) => acc + u.deficit * u.cost, 0);
      sileo.success({
        title: `Se generaron ${toCreate.length} lote(s) inicial(es).`,
        description: `Valor de referencia: ${g(totalValor)}. Ya podés compararlo con Lista de Productos.`,
      });
      await fetchAll();
    } catch (e) {
      console.error('Error reconciliando stock inicial:', e);
      sileo.error({ title: 'Error al generar los lotes iniciales.' });
    } finally {
      setReconciling(false);
    }
  };

  const confirmReconciliation = () => {
    setConfirmModal({
      title: '¿Generar lotes de stock inicial?',
      description: 'Por cada producto donde el stock actual sea mayor a lo que suman sus lotes, se crea un lote con la diferencia, usando el costo actual como referencia (no el costo real de esa compra) y una fecha anterior a cualquier lote real, para que se consuma primero. No borra ni modifica ningún lote existente. Se puede ejecutar más de una vez sin duplicar.',
      confirmText: 'Sí, generar lotes',
      variant: 'warning',
      onConfirm: runReconciliation,
    });
  };

  // ── Filtro de lotes por fecha (afecta los totales de compra/restante) ────
  const dateFilteredBatches = batches.filter(b => {
    let ok = true;
    if (dateStart) {
      const [sy, sm, sd] = dateStart.split('-').map(Number);
      ok = ok && b.entryDateObj >= new Date(sy, sm - 1, sd, 0, 0, 0, 0);
    }
    if (dateEnd) {
      const [ey, em, ed] = dateEnd.split('-').map(Number);
      ok = ok && b.entryDateObj <= new Date(ey, em - 1, ed, 23, 59, 59, 999);
    }
    return ok;
  });

  // ── Agrupar por producto (independiente del proveedor) ───────────────────
  const term = search.trim().toLowerCase();
  const productGroups = {};

  const ensureGroup = (name) => {
    if (!productGroups[name]) {
      productGroups[name] = {
        name,
        batchesInRange: [], allBatches: [],
        allSales: [],
      };
    }
    return productGroups[name];
  };

  batches.forEach(b => {
    const name = b.productName || 'Sin nombre';
    if (term && !name.toLowerCase().includes(term) && !(b.supplier || '').toLowerCase().includes(term) && !(b.invoiceNo || '').toLowerCase().includes(term)) return;
    ensureGroup(name).allBatches.push(b);
  });
  dateFilteredBatches.forEach(b => {
    const name = b.productName || 'Sin nombre';
    if (!productGroups[name]) return; // ya filtrado por búsqueda arriba
    productGroups[name].batchesInRange.push(b);
  });
  sales.forEach(sale => {
    (sale.items || []).forEach(item => {
      const name = item.name || 'Sin nombre';
      if (term && !name.toLowerCase().includes(term)) return;
      ensureGroup(name).allSales.push({ ...item, saleId: sale.id, ticketId: sale.ticketId, dateObj: sale.dateObj });
    });
  });

  const rows = Object.values(productGroups).map(group => {
    const comprada     = group.batchesInRange.reduce((a, b) => a + (parseFloat(b.qtyOriginal) || 0), 0);
    const restante      = group.batchesInRange.reduce((a, b) => a + (parseFloat(b.qtyRemaining) || 0), 0);
    const costoTotal    = group.batchesInRange.reduce((a, b) => a + (parseFloat(b.qtyOriginal) || 0) * (parseFloat(b.unitCost) || 0), 0);
    const valorRestante = group.batchesInRange.reduce((a, b) => a + (parseFloat(b.qtyRemaining) || 0) * (parseFloat(b.unitCost) || 0), 0);
    const costoProm     = restante > 0 ? valorRestante / restante : 0;

    // Historial completo (entradas + salidas) para el desplegable, sin filtro de fecha
    const movimientos = [
      ...group.allBatches.map(b => ({ tipo: 'entrada', dateObj: b.entryDateObj, ...b })),
      ...group.allSales.map(s => ({ tipo: 'salida', dateObj: s.dateObj, ...s })),
    ].sort((a, b) => b.dateObj - a.dateObj);

    return { ...group, comprada, restante, costoTotal, valorRestante, costoProm, movimientos };
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const totalCompra   = rows.reduce((a, r) => a + r.costoTotal, 0);
  const totalRestante = rows.reduce((a, r) => a + r.valorRestante, 0);

  const toggleRow = (name) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const handleDownload = () => {
    const wb = XLSX.utils.book_new();

    const summary = rows.map(r => ({
      'Producto':              r.name,
      'Cantidad Comprada':     r.comprada,
      'Cantidad Restante':     r.restante,
      'Costo Prom. Restante':  Math.round(r.costoProm),
      'Costo Total Comprado':  Math.round(r.costoTotal),
      'Valor Restante':        Math.round(r.valorRestante),
    }));
    const summarySheet = XLSX.utils.json_to_sheet(summary);
    summarySheet['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 16 }];
    styleHeaderRow(summarySheet);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Resumen por Producto');

    const detail = [];
    rows.forEach(r => {
      r.movimientos.forEach(m => {
        if (m.tipo === 'entrada') {
          detail.push({
            'Producto':  r.name,
            'Fecha':     formatDateTime(m.dateObj, { hourCycle: 'h23' }),
            'Tipo':      'Entrada',
            'Detalle':   `${m.supplier || '-'}${m.invoiceNo ? ' · Fact. ' + m.invoiceNo : ''}`,
            'Cantidad':  m.qtyOriginal,
            'Costo Unit.': m.unitCost,
            'Total':     Math.round((parseFloat(m.qtyOriginal) || 0) * (parseFloat(m.unitCost) || 0)),
          });
        } else {
          detail.push({
            'Producto':  r.name,
            'Fecha':     formatDateTime(m.dateObj, { hourCycle: 'h23' }),
            'Tipo':      'Salida',
            'Detalle':   `Venta #${m.ticketId || '-'}`,
            'Cantidad':  -(parseFloat(m.quantity) || 0),
            'Costo Unit.': m.cost,
            'Total':     -Math.round((parseFloat(m.quantity) || 0) * (parseFloat(m.cost) || 0)),
          });
        }
      });
    });
    const detailSheet = XLSX.utils.json_to_sheet(detail);
    detailSheet['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 10 }, { wch: 32 }, { wch: 12 }, { wch: 14 }, { wch: 16 }];
    styleHeaderRow(detailSheet);
    XLSX.utils.book_append_sheet(wb, detailSheet, 'Detalle Entradas y Salidas');

    const date = new Date().toLocaleDateString('es-PY').replace(/\//g, '-');
    XLSX.writeFile(wb, `Ficha_Mercaderias_${date}.xlsx`);
  };

  if (loading) return <div className="p-10 text-center text-gray-500">Cargando ficha de mercaderías...</div>;

  return (
    <div className="max-w-7xl mx-auto pb-20">
      {confirmModal && <ConfirmModal {...confirmModal} onClose={() => setConfirmModal(null)} />}

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ClipboardList className="text-blue-600" size={26}/>
            Ficha de Mercaderías
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Una fila por producto. Cada compra queda como un lote con su propio costo (costeo FIFO) —
            desplegá un producto para ver el detalle de entradas y salidas.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={confirmReconciliation}
            disabled={reconciling}
            title="Genera un lote por la mercadería que ya existía antes de usar Entrada Mercadería, para que el stock coincida con Lista de Productos"
            className="bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 px-4 py-2.5 rounded-lg flex items-center gap-2 shadow-sm transition-colors font-medium whitespace-nowrap disabled:opacity-50"
          >
            {reconciling ? <Loader2 size={18} className="animate-spin"/> : <RefreshCcw size={18}/>}
            Generar Lote Inicial
          </button>
          <button
            onClick={handleDownload}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 shadow-sm transition-colors font-medium whitespace-nowrap"
          >
            <FileSpreadsheet size={20}/> Exportar Excel
          </button>
        </div>
      </div>

      {/* FILTROS */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={18}/>
          <input
            type="text"
            placeholder="Buscar por producto, proveedor o factura..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-primary text-sm"
          />
        </div>
        <div className="flex items-center gap-2 px-2 border-l border-gray-200">
          <Calendar size={18} className="text-gray-400"/>
          <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
            className="text-sm bg-transparent focus:outline-none text-gray-600"/>
          <span className="text-gray-400">-</span>
          <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
            className="text-sm bg-transparent focus:outline-none text-gray-600"/>
        </div>
      </div>

      {/* RESUMEN */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-gray-400 uppercase">Productos</p>
          <p className="text-2xl font-black text-gray-800 mt-1">{rows.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-gray-400 uppercase">Costo total comprado</p>
          <p className="text-2xl font-black text-gray-800 mt-1">{g(totalCompra)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-gray-400 uppercase">Valor restante en stock</p>
          <p className="text-2xl font-black text-green-700 mt-1">{g(totalRestante)}</p>
        </div>
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-auto max-h-[65vh]">
          <table className="w-full text-sm text-left">
            <thead className="bg-primary text-white text-xs uppercase font-bold tracking-wider sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4">Producto</th>
                <th className="px-6 py-4 text-right">Comprada</th>
                <th className="px-6 py-4 text-right">Restante</th>
                <th className="px-6 py-4 text-right">Costo Prom.</th>
                <th className="px-6 py-4 text-right">Valor Restante</th>
                <th className="px-6 py-4 w-10"/>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-gray-400">
                    <Package size={32} className="mx-auto mb-2 opacity-30"/>
                    No se encontraron productos con estos filtros.
                  </td>
                </tr>
              ) : rows.map(r => {
                const isOpen = expanded.has(r.name);
                return (
                  <React.Fragment key={r.name}>
                    <tr onClick={() => toggleRow(r.name)}
                      className={`cursor-pointer transition-colors select-none ${isOpen ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}>
                      <td className="px-6 py-4 font-bold text-gray-800">{r.name}</td>
                      <td className="px-6 py-4 text-right text-gray-700">{r.comprada.toLocaleString('es-PY', { maximumFractionDigits: 3 })}</td>
                      <td className="px-6 py-4 text-right font-bold">
                        <span className={r.restante > 0 ? 'text-green-600' : 'text-gray-400'}>
                          {r.restante.toLocaleString('es-PY', { maximumFractionDigits: 3 })}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-gray-600">{g(r.costoProm)}</td>
                      <td className="px-6 py-4 text-right font-bold text-gray-800">{g(r.valorRestante)}</td>
                      <td className="px-6 py-4 text-center text-gray-400">
                        {isOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr>
                        <td colSpan={6} className="p-0 border-b border-gray-100">
                          <div className="bg-slate-50 pl-10 pr-4 py-4">
                            {r.movimientos.length === 0 ? (
                              <p className="text-center text-xs text-gray-400 italic py-2">Sin movimientos registrados.</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-500 font-bold uppercase border-b border-gray-200 text-[10px]">
                                    <th className="text-left pb-2 pl-2 tracking-wider">Fecha</th>
                                    <th className="text-left pb-2 tracking-wider">Tipo</th>
                                    <th className="text-left pb-2 tracking-wider">Detalle</th>
                                    <th className="text-right pb-2 tracking-wider">Cantidad</th>
                                    <th className="text-right pb-2 tracking-wider">Costo Unit.</th>
                                    <th className="text-right pb-2 pr-2 tracking-wider">Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {r.movimientos.map((m, idx) => {
                                    const esInicial = m.tipo === 'entrada' && m.isInitialStock;
                                    return (
                                      <tr key={idx} className="hover:bg-white transition-colors">
                                        <td className="py-2 pl-2 text-gray-500 whitespace-nowrap">{formatDateTime(m.dateObj, { hourCycle: 'h23' })}</td>
                                        <td className="py-2">
                                          {m.tipo === 'entrada' ? (
                                            <span className="inline-flex items-center gap-1 text-green-700 font-bold">
                                              <ArrowDownCircle size={12}/> Entrada
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1 text-red-600 font-bold">
                                              <ArrowUpCircle size={12}/> Salida
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-2 text-gray-600">
                                          {m.tipo === 'entrada'
                                            ? (esInicial
                                                ? <span className="text-blue-600 font-bold">Stock inicial</span>
                                                : `${m.supplier || '-'}${m.invoiceNo ? ' · Fact. ' + m.invoiceNo : ''}`)
                                            : `Venta #${m.ticketId || '-'}`}
                                        </td>
                                        <td className={`py-2 text-right font-bold ${m.tipo === 'entrada' ? 'text-green-700' : 'text-red-600'}`}>
                                          {m.tipo === 'entrada'
                                            ? `+${parseFloat(m.qtyOriginal || 0).toLocaleString('es-PY', { maximumFractionDigits: 3 })}`
                                            : `-${parseFloat(m.quantity || 0).toLocaleString('es-PY', { maximumFractionDigits: 3 })}`}
                                        </td>
                                        <td className="py-2 text-right text-gray-500">
                                          {g(m.tipo === 'entrada' ? m.unitCost : m.cost)}
                                        </td>
                                        <td className="py-2 pr-2 text-right font-medium text-gray-700">
                                          {m.tipo === 'entrada'
                                            ? g((parseFloat(m.qtyOriginal) || 0) * (parseFloat(m.unitCost) || 0))
                                            : g((parseFloat(m.quantity) || 0) * (parseFloat(m.cost) || 0))}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
