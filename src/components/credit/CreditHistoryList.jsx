import React from 'react';
import { Receipt, Ban } from 'lucide-react';
import { formatDateTime, formatDate } from '../../utils/dateUtils';

/**
 * Línea de tiempo combinada de un cliente: ventas fiadas, deudas cargadas a
 * mano y pagos. Reutilizado por el modal "Cobrar Fiado" del cajero y el módulo
 * "Clientes Fiados" del admin (que además puede anular pagos y deudas manuales).
 */
export default function CreditHistoryList({ credit, canVoid, onVoidPayment, onVoidCharge, voidingId }) {
  const entries = [
    ...(credit?.sales    || []).map(s => ({ type: 'venta', ...s })),
    ...(credit?.charges  || []).map(c => ({ type: 'deuda', ...c })),
    ...(credit?.payments || []).map(p => ({ type: 'pago',  ...p })),
  ].sort((a, b) => b.dateObj - a.dateObj);

  if (entries.length === 0) {
    return <p className="text-center text-gray-400 text-xs py-4">Sin movimientos registrados.</p>;
  }

  const isDebit = (t) => t === 'venta' || t === 'deuda';

  const label = (entry) => {
    if (entry.type === 'venta') return `Venta fiada ${entry.ticketId ? '#' + entry.ticketId : ''}`;
    if (entry.type === 'deuda') return 'Deuda anterior (carga manual)';
    return 'Pago';
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold text-gray-400 uppercase mb-1 flex items-center gap-1.5">
        <Receipt size={13}/> Historial
      </p>
      {entries.map(entry => {
        const isVoided = entry.type !== 'venta' && entry.status === 'voided';
        const canVoidThis = canVoid && !isVoided && (
          (entry.type === 'pago'  && onVoidPayment) ||
          (entry.type === 'deuda' && onVoidCharge)
        );
        return (
          <div key={`${entry.type}-${entry.id}`}
            className={`flex justify-between items-center p-2.5 rounded-lg text-xs border ${
              isVoided
                ? 'bg-gray-50 border-gray-200 opacity-60'
                : isDebit(entry.type)
                  ? 'bg-red-50/50 border-red-100'
                  : 'bg-green-50/50 border-green-100'
            }`}
          >
            <div>
              <p className="font-bold text-gray-700">
                {label(entry)}
                {isVoided && <span className="ml-1.5 text-[9px] text-gray-400 font-black uppercase">Anulado</span>}
              </p>
              <p className="text-gray-400">
                {entry.type === 'deuda' ? formatDate(entry.dateObj) : formatDateTime(entry.dateObj)}
              </p>
              {entry.note && <p className="text-gray-500 italic mt-0.5">{entry.note}</p>}
              {entry.type === 'deuda' && entry.createdByName && (
                <p className="text-gray-400 mt-0.5">Cargado por {entry.createdByName}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <p className={`font-black ${isDebit(entry.type) ? 'text-red-600' : 'text-green-700'}`}>
                {isDebit(entry.type) ? '+' : '-'} ₲ {(parseFloat(entry.total || entry.amount || 0)).toLocaleString('es-PY')}
              </p>
              {canVoidThis && (
                <button
                  onClick={() => (entry.type === 'pago' ? onVoidPayment(entry) : onVoidCharge(entry))}
                  disabled={voidingId === entry.id}
                  title={entry.type === 'pago' ? 'Anular pago' : 'Anular deuda'}
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
