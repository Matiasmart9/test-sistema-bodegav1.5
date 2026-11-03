import React, { useState, useMemo } from 'react';
import { Receipt, Ban, ChevronDown, ChevronUp, CheckCircle2, Clock, AlertCircle, Check } from 'lucide-react';
import { formatDateTime, formatDate } from '../../utils/dateUtils';
import { computeCreditAllocation } from '../../utils/creditUtils';
import TicketPreviewModal from './TicketPreviewModal';

/**
 * Línea de tiempo combinada de un cliente: ventas fiadas (con detalle de
 * productos pagados, parciales y pendientes + vista de ticket completo),
 * deudas cargadas a mano y pagos.
 * Reutilizado por el modal "Cobrar Fiado" del cajero y el módulo
 * "Clientes Fiados" del admin.
 */
export default function CreditHistoryList({
  credit,
  canVoid,
  onVoidPayment,
  onVoidCharge,
  voidingId,
  previewPaymentAmount = 0,
  selectedToPay = {},
  onToggleSelectItemToPay,
  onToggleManualItemPaid,
  togglingItemKey = null,
}) {
  const [ticketModalSale, setTicketModalSale] = useState(null);
  const [collapsedMap, setCollapsedMap] = useState({});

  // Si el usuario está escribiendo un monto a cobrar, calculamos también cómo
  // quedaría cada ticket/producto con ese pago aplicado.
  const previewSalesMap = useMemo(() => {
    const extra = Math.max(0, Math.round(parseFloat(previewPaymentAmount) || 0));
    if (!extra || !credit?.sales) return null;

    // Si hay ítems seleccionados con tilde para este cobro, los priorizamos en la simulación
    const simulatedSales = (credit.sales || []).map(s => {
      const sel = selectedToPay[s.id] || [];
      if (sel.length === 0) return s;
      const merged = [...new Set([...(s.paidItemIndices || []), ...sel])];
      return { ...s, paidItemIndices: merged };
    });

    const allocated = computeCreditAllocation(
      simulatedSales,
      credit.charges || [],
      (credit.totalPaid || 0) + extra
    );
    const map = {};
    allocated.forEach(s => { map[s.id] = s.creditStatus; });
    return map;
  }, [credit, previewPaymentAmount, selectedToPay]);

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

  const isExpanded = (entry) => {
    if (entry.id in collapsedMap) return !collapsedMap[entry.id];
    // Por defecto, las ventas con saldo pendiente aparecen desplegadas para ver los productos al instante
    const isPending = (entry.creditStatus?.pendingAmount ?? entry.total ?? 0) > 0;
    return isPending;
  };

  const toggleExpand = (id) => {
    setCollapsedMap(prev => ({
      ...prev,
      [id]: prev[id] !== undefined ? !prev[id] : true,
    }));
  };

  return (
    <div className="space-y-2.5">
      {ticketModalSale && (
        <TicketPreviewModal
          sale={ticketModalSale}
          onClose={() => setTicketModalSale(null)}
        />
      )}

      <p className="text-xs font-bold text-gray-400 uppercase mb-1 flex items-center gap-1.5">
        <Receipt size={13}/> Historial y Detalle de Tickets
      </p>

      {entries.map(entry => {
        const isVoided = entry.type !== 'venta' && entry.status === 'voided';
        const canVoidThis = canVoid && !isVoided && (
          (entry.type === 'pago'  && onVoidPayment) ||
          (entry.type === 'deuda' && onVoidCharge)
        );

        if (entry.type !== 'venta') {
          return (
            <div
              key={`${entry.type}-${entry.id}`}
              className={`flex justify-between items-center p-2.5 rounded-xl text-xs border ${
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
        }

        // ── VENTA FIADA (con desglose de productos y estado de pago) ───────────
        const cs = entry.creditStatus || {
          status: 'pending',
          paidAmount: 0,
          pendingAmount: Math.round(parseFloat(entry.total) || 0),
          items: (entry.items || []).map((it, idx) => ({
            ...it,
            idx,
            rawLine: Math.round((parseFloat(it.price) || 0) * (parseFloat(it.quantity) || 1)),
            effectiveLine: Math.round((parseFloat(it.price) || 0) * (parseFloat(it.quantity) || 1)),
            status: 'pending',
            paidAmount: 0,
            pendingAmount: Math.round((parseFloat(it.price) || 0) * (parseFloat(it.quantity) || 1)),
          })),
        };
        const previewCs = previewSalesMap?.[entry.id] || null;
        const expanded = isExpanded(entry);
        const selectedIndices = selectedToPay[entry.id] || [];

        const borderClass = cs.status === 'paid'
          ? 'bg-emerald-50/40 border-emerald-200'
          : cs.status === 'partial'
            ? 'bg-amber-50/40 border-amber-200'
            : 'bg-red-50/40 border-red-200';

        return (
          <div key={`venta-${entry.id}`} className={`rounded-xl border overflow-hidden transition-all ${borderClass}`}>
            {/* Cabecera del ticket */}
            <div className="p-3 flex flex-wrap items-center justify-between gap-2">
              <div
                onClick={() => toggleExpand(entry.id)}
                className="flex-1 min-w-[180px] cursor-pointer select-none"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-gray-800 text-xs flex items-center gap-1">
                    {label(entry)}
                  </p>
                  {cs.status === 'paid' && (
                    <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 size={11}/> Pagado
                    </span>
                  )}
                  {cs.status === 'partial' && (
                    <span className="text-[10px] font-black uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Clock size={11}/> Parcial
                    </span>
                  )}
                  {cs.status === 'pending' && (
                    <span className="text-[10px] font-black uppercase bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <AlertCircle size={11}/> Pendiente
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-gray-500 mt-0.5">
                  {formatDateTime(entry.dateObj)}
                  {entry.items?.length ? ` · ${entry.items.length} prod.` : ''}
                </p>

                {cs.paidAmount > 0 && cs.pendingAmount > 0 && (
                  <p className="text-[11px] font-bold text-amber-800 mt-0.5">
                    Pagado: ₲ {cs.paidAmount.toLocaleString('es-PY')} · Falta: ₲ {cs.pendingAmount.toLocaleString('es-PY')}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className={`font-black text-xs ${cs.status === 'paid' ? 'text-emerald-700 line-through' : 'text-red-600'}`}>
                    + ₲ {(parseFloat(entry.total || 0)).toLocaleString('es-PY')}
                  </p>
                  {cs.status === 'partial' && (
                    <p className="text-[10px] font-black text-rose-600">
                      Resta ₲ {cs.pendingAmount.toLocaleString('es-PY')}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setTicketModalSale(entry)}
                  className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold flex items-center gap-1 shadow-sm transition-colors"
                  title="Ver e imprimir el ticket completo"
                >
                  <Receipt size={13}/> Ver Ticket
                </button>

                <button
                  type="button"
                  onClick={() => toggleExpand(entry.id)}
                  className="p-1.5 text-gray-500 hover:bg-white/80 rounded-lg transition-colors"
                  title={expanded ? 'Ocultar productos' : 'Ver productos del ticket'}
                >
                  {expanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
                </button>
              </div>
            </div>

            {/* Desglose de productos del ticket */}
            {expanded && (
              <div className="bg-white/95 border-t border-gray-200/80 px-3 py-2.5 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase">
                  <span>Productos del ticket (marcá para cobrar o reconocer pagados)</span>
                  <span>Importe</span>
                </div>

                <div className="space-y-1.5">
                  {cs.items.map((item) => {
                    const isSelectedForPayment = selectedIndices.includes(item.idx);
                    const previewItem = previewCs?.items?.[item.idx];
                    const itemKey = `${entry.id}-${item.idx}`;
                    const isToggling = togglingItemKey === itemKey;

                    // Estado efectivo a mostrar (incluye vista previa si se está ingresando un cobro)
                    const effectiveStatus = item.status;
                    const willBecomePaid = effectiveStatus !== 'paid' && previewItem?.status === 'paid';
                    const willBecomePartial = effectiveStatus !== 'paid' && previewItem?.status === 'partial' && (previewItem?.paidAmount || 0) > (item.paidAmount || 0);

                    const canSelectToCharge = cs.pendingAmount > 0 && effectiveStatus !== 'paid' && !!onToggleSelectItemToPay;
                    const canToggleManual = !!onToggleManualItemPaid && cs.status === 'partial';

                    return (
                      <div
                        key={item.idx}
                        onClick={() => {
                          if (canSelectToCharge) {
                            onToggleSelectItemToPay(entry, item);
                          } else if (canToggleManual) {
                            onToggleManualItemPaid(entry, item.idx);
                          }
                        }}
                        className={`p-2 rounded-lg border text-xs transition-all flex items-start justify-between gap-2 ${
                          (canSelectToCharge || canToggleManual) ? 'cursor-pointer' : ''
                        } ${
                          effectiveStatus === 'paid'
                            ? 'bg-emerald-50/70 border-emerald-200'
                            : isSelectedForPayment
                              ? 'bg-amber-50 border-amber-400 ring-1 ring-amber-400/40'
                              : effectiveStatus === 'partial'
                                ? 'bg-amber-50/60 border-amber-200'
                                : 'bg-gray-50/70 border-gray-200 hover:border-amber-300'
                        }`}
                      >
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          {/* Checkbox / Estado interactivo */}
                          <div className="pt-0.5 shrink-0">
                            {effectiveStatus === 'paid' ? (
                              <button
                                type="button"
                                disabled={!canToggleManual || isToggling}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (canToggleManual) onToggleManualItemPaid(entry, item.idx);
                                }}
                                title={canToggleManual ? 'Clic para cambiar prioridad de producto pagado' : 'Producto cancelado'}
                                className="w-4 h-4 rounded bg-emerald-600 text-white flex items-center justify-center shadow-sm"
                              >
                                <Check size={11} strokeWidth={3}/>
                              </button>
                            ) : (
                              <input
                                type="checkbox"
                                checked={isSelectedForPayment}
                                onChange={() => {}}
                                className="w-4 h-4 rounded accent-amber-600 cursor-pointer"
                                title="Marcar producto para cobrar"
                              />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`font-bold ${effectiveStatus === 'paid' ? 'line-through text-emerald-800' : 'text-gray-800'}`}>
                                {item.quantity}× {item.name}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                (₲ {parseInt(item.price || 0).toLocaleString('es-PY')} c/u)
                              </span>
                            </div>

                            {item.discountApplied > 0 && (
                              <p className="text-[10px] text-emerald-700 font-medium">
                                Precio lista: ₲ {item.rawLine.toLocaleString('es-PY')} − Desc. ticket: ₲ {item.discountApplied.toLocaleString('es-PY')}
                              </p>
                            )}

                            {/* Badges de estado del producto */}
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {effectiveStatus === 'paid' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md uppercase">
                                  ✓ Cancelado / Pagado
                                </span>
                              )}

                              {effectiveStatus === 'partial' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                                  ⏳ PAGO PARCIAL: Cubierto ₲ {item.paidAmount.toLocaleString('es-PY')} · Falta ₲ {item.pendingAmount.toLocaleString('es-PY')}
                                  {item.unitsPaid > 0 && parseFloat(item.quantity) > 1 ? ` (${item.unitsPaid} de ${item.quantity} u. pagadas)` : ''}
                                </span>
                              )}

                              {effectiveStatus === 'pending' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100/70 px-2 py-0.5 rounded-md">
                                  Pendiente: ₲ {item.pendingAmount.toLocaleString('es-PY')}
                                </span>
                              )}

                              {/* Botón para fijar manualmente como pagado si el ticket tiene pago parcial */}
                              {canToggleManual && effectiveStatus !== 'paid' && cs.paidAmount >= item.effectiveLine && (
                                <button
                                  type="button"
                                  disabled={isToggling}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleManualItemPaid(entry, item.idx);
                                  }}
                                  className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md transition-colors"
                                >
                                  ✓ Marcar como ya cancelado
                                </button>
                              )}

                              {/* Vista previa en vivo cuando el usuario escribe un monto a cobrar */}
                              {willBecomePaid && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-md">
                                  → Queda PAGADO con este cobro
                                </span>
                              )}
                              {willBecomePartial && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-md">
                                  → Cubrirá ₲ {previewItem.paidAmount.toLocaleString('es-PY')} (Faltará ₲ {previewItem.pendingAmount.toLocaleString('es-PY')})
                                </span>
                              )}
                            </div>

                            {/* Barra de progreso para ítem con pago parcial */}
                            {effectiveStatus === 'partial' && item.effectiveLine > 0 && (
                              <div className="w-full h-1.5 bg-amber-100 rounded-full overflow-hidden mt-1.5">
                                <div
                                  className="h-full bg-amber-500 rounded-full transition-all"
                                  style={{ width: `${Math.min(100, Math.round((item.paidAmount / item.effectiveLine) * 100))}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className={`font-black text-xs ${effectiveStatus === 'paid' ? 'line-through text-emerald-700' : 'text-gray-800'}`}>
                            ₲ {item.effectiveLine.toLocaleString('es-PY')}
                          </p>
                          {effectiveStatus === 'partial' && (
                            <p className="text-[10px] font-bold text-rose-600">
                              Falta ₲ {item.pendingAmount.toLocaleString('es-PY')}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pie resumen del ticket */}
                {(entry.discountTotal > 0 || cs.paidAmount > 0) && (
                  <div className="pt-1.5 border-t border-dashed border-gray-200 flex flex-wrap justify-between items-center text-[11px] gap-2">
                    {entry.discountTotal > 0 ? (
                      <span className="text-gray-500">
                        Subtotal: ₲ {(entry.subTotal || entry.total).toLocaleString('es-PY')} · Desc.: −₲ {entry.discountTotal.toLocaleString('es-PY')}
                      </span>
                    ) : <span />}
                    <span className="font-bold text-gray-700">
                      Pagado en ticket: <strong className="text-emerald-700">₲ {cs.paidAmount.toLocaleString('es-PY')}</strong>
                      {' · '}
                      Pendiente: <strong className="text-rose-600">₲ {cs.pendingAmount.toLocaleString('es-PY')}</strong>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
