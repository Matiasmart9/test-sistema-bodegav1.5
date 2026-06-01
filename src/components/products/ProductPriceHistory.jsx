import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { TrendingUp, TrendingDown, Minus, Loader2, History } from 'lucide-react';
import { formatDate as fmtDate, formatTime } from '../../utils/dateUtils';

const g = (n) => `₲ ${Math.round(n || 0).toLocaleString('es-PY')}`;

export default function ProductPriceHistory({ productId }) {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productId) { setLoading(false); return; }
    const fetch = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'price_logs'),
            where('productId', '==', productId)
            // orderBy removido — requería índice compuesto en Firestore
            // se ordena en el cliente abajo
          )
        );
        const sorted = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const da = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0);
            const db_ = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0);
            return db_ - da; // desc
          });
        setLogs(sorted);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetch();
  }, [productId]);

  if (!productId) return null;

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return fmtDate(d) + ' ' + formatTime(d);
  };

  const DeltaBadge = ({ oldVal, newVal }) => {
    if (oldVal === null || oldVal === undefined) {
      return <span className="text-xs text-gray-400 italic">Precio inicial</span>;
    }
    const diff = newVal - oldVal;
    if (diff === 0) return <span className="text-xs text-gray-400">Sin cambio</span>;
    return (
      <span className={`flex items-center gap-1 text-xs font-bold
        ${diff > 0 ? 'text-green-600' : 'text-red-500'}`}>
        {diff > 0 ? <TrendingUp size={13}/> : <TrendingDown size={13}/>}
        {diff > 0 ? '+' : ''}{g(diff)}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
        <History size={20} className="text-indigo-500"/> Historial de Precios
      </h3>
      <p className="text-xs text-gray-400 mb-4">Registro de cambios de precio de venta y costo.</p>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="animate-spin text-gray-400" size={24}/>
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          <History size={28} className="mx-auto mb-2 opacity-20"/>
          <p>Sin cambios de precio registrados aún.</p>
          <p className="text-xs mt-1">Los cambios se registran automáticamente al editar el producto.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 font-bold uppercase border-b border-gray-100 text-[10px]">
                <th className="text-left pb-3 tracking-wider">Fecha</th>
                <th className="text-right pb-3 tracking-wider">Precio venta</th>
                <th className="text-right pb-3 tracking-wider">Variación</th>
                <th className="text-right pb-3 tracking-wider">Costo</th>
                <th className="text-right pb-3 tracking-wider">Variación</th>
                <th className="text-left pb-3 tracking-wider pl-4">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 text-gray-500 whitespace-nowrap">{formatDate(log.date)}</td>
                  <td className="py-3 text-right font-bold text-gray-800">{g(log.newPrice)}</td>
                  <td className="py-3 text-right">
                    <DeltaBadge oldVal={log.oldPrice} newVal={log.newPrice}/>
                  </td>
                  <td className="py-3 text-right text-gray-600">{g(log.newCost)}</td>
                  <td className="py-3 text-right">
                    <DeltaBadge oldVal={log.oldCost} newVal={log.newCost}/>
                  </td>
                  <td className="py-3 pl-4 text-gray-400 font-medium">{log.user || 'Sistema'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}