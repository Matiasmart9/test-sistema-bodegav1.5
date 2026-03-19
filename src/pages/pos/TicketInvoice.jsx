import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';

// IVA incluido: 10% → total/11 | 5% → total/21
const ivaIncluido = (importe, tasa = 10) =>
  Math.round(importe / (tasa === 5 ? 21 : 11));

const formatPaymentMethod = (method) => {
  const m = { cash: 'EFECTIVO', qr: 'QR', card: 'TARJETA', transfer: 'TRANSFERENCIA' };
  return m[method] || method;
};

export default function TicketInvoice({
  cart, total, amountPaid, change, paymentMethod,
  ticketId, date, client, copyLabel, cashierName,
  subTotal, discountTotal, appliedDiscounts
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
      <div className="mb-3 space-y-1 font-medium">
        <div className="flex justify-between">
          <span>FECHA:</span>
          <span>{date.toLocaleDateString()} {date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
        </div>
        <div className="flex justify-between"><span>TICKET:</span><span>#{ticketId}</span></div>
        <div className="flex justify-between"><span>CAJERO:</span><span className="uppercase">{cashierName || 'SISTEMA'}</span></div>
        <div className="border-b border-dotted border-gray-400 my-1"></div>
        <div className="flex justify-between">
          <span>CLIENTE:</span>
          <span className="font-bold text-right max-w-[150px] truncate uppercase">{clientName}</span>
        </div>
        <div className="flex justify-between"><span>RUC/CI:</span><span>{clientRuc}</span></div>
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
          return (
            <div key={idx} className="flex items-start">
              <span className="w-5 font-bold">{item.quantity}</span>
              <div className="flex-1 px-1">
                <span className="block font-medium leading-tight">{item.name}</span>
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
        <div className="flex justify-between"><span>RECIBIDO:</span><span>₲ {(parseFloat(amountPaid) || total).toLocaleString()}</span></div>
        <div className="flex justify-between text-sm pt-1 border-t border-gray-200 mt-1">
          <span>VUELTO:</span><span>₲ {(parseFloat(change) || 0).toLocaleString()}</span>
        </div>
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