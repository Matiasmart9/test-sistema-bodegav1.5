import React from 'react';
import { Receipt, Ban } from 'lucide-react';
import { formatDateTime } from '../../utils/dateUtils';

/**
 * Línea de tiempo combinada de ventas fiadas + pagos de un cliente.
 * Reutilizado por el modal "Cobrar Fiado" del cajero y el módulo
 * "Clientes Fiados" del admin (que además puede anular pagos).
 */
export default function CreditHistoryList({ credit, canVoid, onVoidPayment, voidingId }) {
  const entries = [
    ...(credit?.sales || []).map(s => ({ type: 'venta', ...s })),
    ...(credit?.payments || []).map(p => ({ type: 'pago', ...p })),
  ].sort((a, b) => b.dateObj - a.dateObj);

  if (entries.length === 0) {
    return <p className="text-center text-gray-400 text-xs py-4">Sin movimientos registrados.</p>;
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold text-gray-400 uppercase mb-1 flex items-center gap-1.5">
        <Receipt size={13}/> Historial
      </p>
      {entries.map(entry => {
        const isVoided = entry.type === 'pago' && entry.status === 'voided';
        return (
          <div key={`${entry.type}-${entry.id}`}
            className={`flex justify-between items-center p-2.5 rounded-lg text-xs border ${
              entry.type === 'venta'
                ? 'bg-red-50/50 border-red-100'
                : isVoided
                  ? 'bg-gray-50 border-gray-200 opacity-60'
                  : 'bg-green-50/50 border-green-100'
            }`}
          >
            <div>
              <p className="font-bold text-gray-700">
                {entry.type === 'venta' ? `Venta fiada ${entry.ticketId ? '#' + entry.ticketId : ''}` : 'Pago'}
                {isVoided && <span className="ml-1.5 text-[9px] text-gray-400 font-black uppercase">Anulado</span>}
              </p>
              <p className="text-gray-400">{formatDateTime(entry.dateObj)}</p>
              {entry.note && <p className="text-gray-500 italic mt-0.5">{entry.note}</p>}
            </div>
            <div className="flex items-center gap-2">
              <p className={`font-black ${entry.type === 'venta' ? 'text-red-600' : 'text-green-700'}`}>
                {entry.type === 'venta' ? '+' : '-'} ₲ {(parseFloat(entry.total || entry.amount || 0)).toLocaleString('es-PY')}
              </p>
              {canVoid && entry.type === 'pago' && !isVoided && (
                <button
                  onClick={() => onVoidPayment(entry)}
                  disabled={voidingId === entry.id}
                  title="Anular pago"
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                >
                  <Ban size={14}/>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
