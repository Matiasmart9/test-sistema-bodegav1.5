import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Search, Calendar, ClipboardList, Package } from 'lucide-react';
import { formatDateTime } from '../../utils/dateUtils';

export default function ProductLedger() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search,    setSearch]    = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd,   setDateEnd]   = useState('');

  useEffect(() => {
    const fetchBatches = async () => {
      try {
        const q = query(collection(db, 'inventory_batches'), orderBy('entryDate', 'desc'));
        const snap = await getDocs(q);
        const data = snap.docs.map(d => {
          const b = d.data();
          return {
            id: d.id,
            ...b,
            entryDateObj: b.entryDate?.toDate ? b.entryDate.toDate() : new Date(b.entryDate),
          };
        });
        setBatches(data);
      } catch (e) {
        console.error('Error cargando ficha de mercaderías:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchBatches();
  }, []);

  const filtered = batches.filter(b => {
    const term = search.toLowerCase();
    const matchesSearch = !term ||
      (b.productName || '').toLowerCase().includes(term) ||
      (b.supplier || '').toLowerCase().includes(term) ||
      (b.invoiceNo || '').toLowerCase().includes(term);

    let matchesDate = true;
    if (dateStart) {
      const [sy, sm, sd] = dateStart.split('-').map(Number);
      matchesDate = matchesDate && b.entryDateObj >= new Date(sy, sm - 1, sd, 0, 0, 0, 0);
    }
    if (dateEnd) {
      const [ey, em, ed] = dateEnd.split('-').map(Number);
      matchesDate = matchesDate && b.entryDateObj <= new Date(ey, em - 1, ed, 23, 59, 59, 999);
    }
    return matchesSearch && matchesDate;
  });

  const totalCompra   = filtered.reduce((acc, b) => acc + (parseFloat(b.qtyOriginal || 0) * parseFloat(b.unitCost || 0)), 0);
  const totalRestante = filtered.reduce((acc, b) => acc + (parseFloat(b.qtyRemaining || 0) * parseFloat(b.unitCost || 0)), 0);

  const handleDownload = () => {
    const excelData = filtered.map(b => ({
      'Fecha':              formatDateTime(b.entryDateObj),
      'Producto':           b.productName || '-',
      'Proveedor':          b.supplier || '-',
      'N° Factura':         b.invoiceNo || '-',
      'Costo Unitario':     parseFloat(b.unitCost || 0),
      'Cantidad Comprada':  parseFloat(b.qtyOriginal || 0),
      'Cantidad Restante':  parseFloat(b.qtyRemaining || 0),
      'Costo Total Compra': parseFloat(b.qtyOriginal || 0) * parseFloat(b.unitCost || 0),
      'Valor Restante':     parseFloat(b.qtyRemaining || 0) * parseFloat(b.unitCost || 0),
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    worksheet['!cols'] = [
      { wch: 18 }, { wch: 28 }, { wch: 20 }, { wch: 16 },
      { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 16 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ficha de Mercaderías');

    const date = new Date().toLocaleDateString('es-PY').replace(/\//g, '-');
    XLSX.writeFile(workbook, `Ficha_Mercaderias_${date}.xlsx`);
  };

  if (loading) return <div className="p-10 text-center text-gray-500">Cargando ficha de mercaderías...</div>;

  return (
    <div className="max-w-7xl mx-auto pb-20">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ClipboardList className="text-blue-600" size={26}/>
            Ficha de Mercaderías
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Cada compra registrada queda como un lote independiente con su propio costo (costeo FIFO).
            La "Cantidad Restante" baja a medida que se vende — el sistema descuenta siempre del lote más antiguo primero.
          </p>
        </div>
        <button
          onClick={handleDownload}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 shadow-sm transition-colors font-medium whitespace-nowrap shrink-0"
        >
          <FileSpreadsheet size={20}/> Exportar Excel
        </button>
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
          <p className="text-xs font-bold text-gray-400 uppercase">Lotes encontrados</p>
          <p className="text-2xl font-black text-gray-800 mt-1">{filtered.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-gray-400 uppercase">Costo total comprado</p>
          <p className="text-2xl font-black text-gray-800 mt-1">₲ {totalCompra.toLocaleString('es-PY')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-gray-400 uppercase">Valor restante en stock</p>
          <p className="text-2xl font-black text-green-700 mt-1">₲ {totalRestante.toLocaleString('es-PY')}</p>
        </div>
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-primary text-white text-xs uppercase font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Producto</th>
                <th className="px-6 py-4">Proveedor</th>
                <th className="px-6 py-4">Factura</th>
                <th className="px-6 py-4 text-right">Costo Unit.</th>
                <th className="px-6 py-4 text-right">Comprada</th>
                <th className="px-6 py-4 text-right">Restante</th>
                <th className="px-6 py-4 text-right">Costo Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-gray-400">
                    <Package size={32} className="mx-auto mb-2 opacity-30"/>
                    No se encontraron lotes de compra con estos filtros.
                  </td>
                </tr>
              ) : filtered.map(b => {
                const consumed = parseFloat(b.qtyRemaining || 0) <= 0;
                return (
                  <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">{formatDateTime(b.entryDateObj)}</td>
                    <td className="px-6 py-4 font-bold text-gray-800">{b.productName || '-'}</td>
                    <td className="px-6 py-4 text-gray-600">{b.supplier || '-'}</td>
                    <td className="px-6 py-4 text-gray-500 font-mono text-xs">{b.invoiceNo || '-'}</td>
                    <td className="px-6 py-4 text-right text-gray-600">₲ {parseFloat(b.unitCost || 0).toLocaleString('es-PY')}</td>
                    <td className="px-6 py-4 text-right font-medium text-gray-700">{parseFloat(b.qtyOriginal || 0).toLocaleString('es-PY')}</td>
                    <td className="px-6 py-4 text-right font-bold">
                      <span className={consumed ? 'text-gray-400' : 'text-green-600'}>
                        {parseFloat(b.qtyRemaining || 0).toLocaleString('es-PY')}
                      </span>
                      {consumed && <span className="ml-1.5 text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">AGOTADO</span>}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-gray-800">
                      ₲ {(parseFloat(b.qtyOriginal || 0) * parseFloat(b.unitCost || 0)).toLocaleString('es-PY')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
