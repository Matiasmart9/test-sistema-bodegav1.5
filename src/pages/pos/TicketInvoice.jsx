import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';

// IVA incluido: 10% → total/11 | 5% → total/21
const ivaIncluido = (importe, tasa = 10) =>
  Math.round(importe / (tasa === 5 ? 21 : 11));

const formatPaymentMethod = (method) => {
  const m = { cash: 'EFECTIVO', qr: 'QR', card: 'TARJETA', transfer: 'TRANSFERENCIA', fiado: 'FIADO' };
  return m[method] || method;
};

export default function TicketInvoice({
  cart = [], total = 0, amountPaid, change, paymentMethod,
  ticketId, date, client, copyLabel, cashierName,
  subTotal, discountTotal, appliedDiscounts,
  creditStatus
}) {
  const [storeData, setStoreData] = useState({
    storeName: 'CARGANDO...', storeRuc: '', timbrado: '',
    address: '', phone: '', ticketFooter: ''
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'general'));
        if (snap.exists()) setStoreData(snap.data());
      } catch (e) { console.error(e); }
    };
    fetchSettings();
  }, []);

  const safeDate = date instanceof Date
    ? date
    : date?.toDate
      ? date.toDate()
      : new Date(date || Date.now());

  let clientName = client?.name || 'SIN NOMBRE';
  if (clientName.toUpperCase() === 'CONSUMIDOR FINAL') clientName = 'SIN NOMBRE';
  const clientRuc = client?.ruc || 'SIN RUC';

  const finalSubTotal = subTotal || total;
  const finalDiscount = discountTotal || 0;

  // Totales IVA
  let iva5 = 0, iva10 = 0;
  cart.forEach(item => {
    const linea = parseFloat(item.price) * parseFloat(item.quantity);
    const tasa  = item.tax === 5 ? 5 : 10;
    if (tasa === 5) iva5  += ivaIncluido(linea, 5);
    else            iva10 += ivaIncluido(linea, 10);
  });
  const ivaTotal = iva5 + iva10;

  // copyLabel === '__HIDE_FOOTER__' → no mostrar pie (lo agrega la ventana de impresión)
  const showFooterLabel = copyLabel && copyLabel !== '__HIDE_FOOTER__';

  return (
    <div className="font-mono text-xs text-gray-900 leading-snug bg-white w-full p-2">

      {/* HEADER */}
      <div className="text-center mb-3">
        <h1 className="text-xl font-black mb-1 uppercase">{storeData.storeName}</h1>
        <div className="text-[11px] font-bold text-gray-600 leading-tight space-y-0.5">
          {storeData.address  && <p>{storeData.address}</p>}
          {storeData.phone    && <p>Tel: {storeData.phone}</p>}
          {storeData.storeRuc && <p>RUC: {storeData.storeRuc}</p>}
          {storeData.timbrado && <p>Timbrado: {storeData.timbrado}</p>}
        </div>
        <div className="border-b-2 border-dashed border-gray-800 my-3"></div>
      </div>

      {/* INFO */}
      <div className="mb-3 space-y-0.5 font-medium text-[11px] text-left">
        <div>
          <span className="font-bold">FECHA: </span>
          <span>{safeDate.toLocaleDateString()} {safeDate.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})}</span>
        </div>
        <div>
          <span className="font-bold">TICKET: </span>
          <span>#{ticketId}</span>
        </div>
        <div>
          <span className="font-bold">CAJERO: </span>
          <span className="uppercase">{cashierName || 'SISTEMA'}</span>
        </div>
        <div className="border-b border-dotted border-gray-400 my-1.5"></div>
        <div>
          <span className="font-bold">CLIENTE: </span>
          <span className="font-bold uppercase">{clientName}</span>
        </div>
        <div>
          <span className="font-bold">RUC/CI: </span>
          <span>{clientRuc}</span>
        </div>
      </div>

      <div className="border-b-2 border-dashed border-gray-800 my-3"></div>

      {/* ENCABEZADO TABLA */}
      <div className="flex font-black text-[10px] mb-1 border-b border-gray-400 pb-1">
        <span className="w-5">C</span>
        <span className="flex-1 px-1">DESCRIPCIÓN</span>
        <span className="w-12 text-right">IVA</span>
        <span className="w-16 text-right">TOTAL</span>
      </div>

      {/* ITEMS */}
      <div className="space-y-2 mb-3">
        {cart.map((item, idx) => {
          const linea    = parseFloat(item.price) * parseFloat(item.quantity);
          const tasa     = item.tax === 5 ? 5 : 10;
          const ivaLinea = ivaIncluido(linea, tasa);
          const itemStatus = creditStatus?.items?.[idx];

          return (
            <div key={idx} className="flex flex-col">
              <div className="flex items-start">
                <span className="w-5 font-bold">{item.quantity}</span>
                <div className="flex-1 px-1">
                  <span className={`block font-medium leading-tight ${itemStatus?.status === 'paid' ? 'line-through text-gray-500' : ''}`}>
                    {item.name}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    ₲{parseInt(item.price).toLocaleString()} c/u · IVA {tasa}%
                  </span>
                </div>
                <span className="w-12 text-right text-[10px] text-gray-500 pt-0.5">
                  {ivaLinea.toLocaleString()}
                </span>
                <span className="w-16 text-right font-bold text-sm">
                  {linea.toLocaleString()}
                </span>
              </div>

              {itemStatus && (
                <div className="pl-5 pr-1 mt-0.5">
                  {itemStatus.status === 'paid' && (
                    <span className="inline-block text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded uppercase">
                      ✓ PAGADO
                    </span>
                  )}
                  {itemStatus.status === 'partial' && (
                    <span className="inline-block text-[9px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded uppercase">
                      PARCIAL: Pagó ₲ {itemStatus.paidAmount.toLocaleString('es-PY')} · Falta ₲ {itemStatus.pendingAmount.toLocaleString('es-PY')}
                      {itemStatus.unitsPaid > 0 && parseFloat(item.quantity) > 1 ? ` (${itemStatus.unitsPaid}/${item.quantity} u.)` : ''}
                    </span>
                  )}
                  {itemStatus.status === 'pending' && (
                    <span className="inline-block text-[9px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded uppercase">
                      PENDIENTE: ₲ {itemStatus.pendingAmount.toLocaleString('es-PY')}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-b-2 border-dashed border-gray-800 my-3"></div>

      {/* TOTALES */}
      <div className="space-y-1 mb-3">
        {finalDiscount > 0 && (
          <div className="flex justify-between text-gray-600">
            <span>SUBTOTAL:</span><span>₲ {finalSubTotal.toLocaleString()}</span>
          </div>
        )}
        {appliedDiscounts && appliedDiscounts.map((d, i) => (
          <div key={i} className="flex justify-between text-xs italic text-gray-500">
            <span>{d.quantity}x {d.name}</span>
            <span>- ₲ {(d.type === 'fixed'
              ? d.value * d.quantity
              : (finalSubTotal * (d.value / 100)) * d.quantity
            ).toLocaleString()}</span>
          </div>
        ))}
        <div className="flex justify-between items-center text-2xl font-black mt-2">
          <span>TOTAL</span><span>₲ {total.toLocaleString()}</span>
        </div>
      </div>

      {/* PAGO */}
      <div className="text-[11px] font-bold mb-3 space-y-1 border border-gray-300 p-2 rounded bg-gray-50">
        <div className="flex justify-between"><span>MÉTODO:</span><span>{formatPaymentMethod(paymentMethod)}</span></div>
        {paymentMethod === 'fiado' ? (
          creditStatus ? (
            <>
              <div className="flex justify-between text-emerald-700 pt-1 border-t border-gray-200 mt-1">
                <span>PAGADO A CUENTA:</span>
                <span>₲ {(creditStatus.paidAmount || 0).toLocaleString('es-PY')}</span>
              </div>
              <div className="flex justify-between text-sm font-black pt-0.5">
                <span>SALDO PENDIENTE:</span>
                <span className={creditStatus.pendingAmount > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                  {creditStatus.pendingAmount > 0
                    ? `₲ ${creditStatus.pendingAmount.toLocaleString('es-PY')}`
                    : '₲ 0 (CANCELADO)'}
                </span>
              </div>
            </>
          ) : (
            <div className="flex justify-between text-sm pt-1 border-t border-gray-200 mt-1">
              <span>SALDO A CRÉDITO:</span><span>₲ {total.toLocaleString()}</span>
            </div>
          )
        ) : (
          <>
            <div className="flex justify-between"><span>RECIBIDO:</span><span>₲ {(parseFloat(amountPaid) || total).toLocaleString()}</span></div>
            <div className="flex justify-between text-sm pt-1 border-t border-gray-200 mt-1">
              <span>VUELTO:</span><span>₲ {(parseFloat(change) || 0).toLocaleString()}</span>
            </div>
          </>
        )}
      </div>

      {/* IVA RESUMEN */}
      <div className="text-[10px] text-gray-600 border-t border-gray-300 pt-1 mb-3">
        <div className="flex justify-between font-bold">
          <span>IVA 5%: ₲{iva5.toLocaleString()}</span>
          <span>10%: ₲{iva10.toLocaleString()}</span>
          <span>TOT: ₲{ivaTotal.toLocaleString()}</span>
        </div>
      </div>

      {/* PIE */}
      <div className="text-center pb-2">
        <p className="font-bold text-xs whitespace-pre-wrap leading-tight">{storeData.ticketFooter}</p>
        {showFooterLabel && (
          <div className="mt-3 border-t border-dashed border-gray-400 pt-2">
            <p className="font-black text-sm uppercase tracking-widest">{copyLabel}</p>
          </div>
        )}
      </div>
    </div>
  );
}
