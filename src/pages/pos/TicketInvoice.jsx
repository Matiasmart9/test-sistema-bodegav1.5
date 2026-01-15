import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';

export default function TicketInvoice({ cart, total, amountPaid, change, paymentMethod, ticketId, date, client, copyLabel, cashierName, subTotal, discountTotal, appliedDiscounts }) {
  
  const [storeData, setStoreData] = useState({
    storeName: 'CARGANDO...', storeRuc: '', timbrado: '', address: '', phone: '', ticketFooter: ''
  });

  useEffect(() => {
    const fetchSettings = async () => {
        try {
            const docRef = doc(db, "settings", "general");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) setStoreData(docSnap.data());
        } catch (error) { console.error(error); }
    };
    fetchSettings();
  }, []);

  const formatPaymentMethod = (method) => {
      const methods = { cash: 'EFECTIVO', qr: 'QR', card: 'TARJETA', transfer: 'TRANSFERENCIA' };
      return methods[method] || method;
  };

  let clientName = client?.name || 'SIN NOMBRE';
  if (clientName.toUpperCase() === 'CONSUMIDOR FINAL') clientName = 'SIN NOMBRE';
  const clientRuc = client?.ruc || 'SIN RUC';

  // Si no vienen props de descuento (tickets viejos), usamos total directo
  const finalSubTotal = subTotal || total;
  const finalDiscount = discountTotal || 0;

  return (
    <div className="font-mono text-xs text-gray-900 leading-snug bg-white w-full p-2">
      
      {/* HEADER */}
      <div className="text-center mb-3">
        <h1 className="text-xl font-black mb-1 uppercase">{storeData.storeName}</h1>
        <div className="text-[11px] font-bold text-gray-600 leading-tight space-y-0.5">
            {storeData.address && <p>{storeData.address}</p>}
            {storeData.phone && <p>Tel: {storeData.phone}</p>}
            {storeData.storeRuc && <p>RUC: {storeData.storeRuc}</p>}
            {storeData.timbrado && <p>Timbrado: {storeData.timbrado}</p>}
        </div>
        <div className="border-b-2 border-dashed border-gray-800 my-3"></div>
      </div>

      {/* INFO FACTURA */}
      <div className="mb-3 space-y-1 font-medium">
        <div className="flex justify-between"><span>FECHA:</span><span>{date.toLocaleDateString()} {date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span></div>
        <div className="flex justify-between"><span>TICKET:</span><span>#{ticketId}</span></div>
        <div className="flex justify-between"><span>CAJERO:</span><span className="uppercase">{cashierName || 'SISTEMA'}</span></div>
        <div className="border-b border-dotted border-gray-400 my-1"></div>
        <div className="flex justify-between"><span>CLIENTE:</span><span className="font-bold text-right max-w-[150px] truncate uppercase">{clientName}</span></div>
        <div className="flex justify-between"><span>RUC/CI:</span><span>{clientRuc}</span></div>
      </div>

      <div className="border-b-2 border-dashed border-gray-800 my-3"></div>

      {/* TABLA ITEMS */}
      <div className="flex font-black text-xs mb-2">
        <span className="w-6">CANT</span>
        <span className="flex-1 px-1">DESCRIPCIÓN</span>
        <span className="w-16 text-right">TOTAL</span>
      </div>

      <div className="space-y-2 mb-3">
        {cart.map((item, idx) => (
            <div key={idx} className="flex items-start">
                <span className="w-6 font-bold">{item.quantity}</span>
                <div className="flex-1 px-1">
                    <span className="block font-medium">{item.name}</span>
                    <span className="text-[10px] text-gray-500">{parseInt(item.price).toLocaleString()}</span>
                </div>
                <span className="w-16 text-right font-bold text-sm">{(item.price * item.quantity).toLocaleString()}</span>
            </div>
        ))}
      </div>

      <div className="border-b-2 border-dashed border-gray-800 my-3"></div>

      {/* TOTALES ESTRUCTURADOS */}
      <div className="space-y-1 mb-3 text-right">
          {finalDiscount > 0 && (
              <div className="flex justify-between text-gray-600">
                  <span>SUBTOTAL:</span>
                  <span>₲ {finalSubTotal.toLocaleString()}</span>
              </div>
          )}
          
          {/* LISTA DE DESCUENTOS SI EXISTEN */}
          {appliedDiscounts && appliedDiscounts.map((d, i) => (
              <div key={i} className="flex justify-between text-xs italic text-gray-500">
                  <span>{d.quantity}x {d.name}</span>
                  <span>- ₲ {(d.type==='fixed' ? d.value*d.quantity : (finalSubTotal*(d.value/100))*d.quantity).toLocaleString()}</span>
              </div>
          ))}

          <div className="flex justify-between items-center text-2xl font-black mt-2">
            <span>TOTAL</span>
            <span>₲ {total.toLocaleString()}</span>
          </div>
      </div>

      {/* PAGO */}
      <div className="text-[11px] font-bold mb-3 space-y-1 border border-gray-300 p-2 rounded bg-gray-50">
          <div className="flex justify-between"><span>MÉTODO:</span><span>{formatPaymentMethod(paymentMethod)}</span></div>
          <div className="flex justify-between"><span>RECIBIDO:</span><span>₲ {(parseFloat(amountPaid)||total).toLocaleString()}</span></div>
          <div className="flex justify-between text-sm pt-1 border-t border-gray-200 mt-1"><span>VUELTO:</span><span>₲ {(parseFloat(change)||0).toLocaleString()}</span></div>
      </div>

      {/* IVA */}
      <div className="text-[10px] text-gray-500 space-y-0.5 mb-4 text-center">
        <div className="flex justify-between border-t border-gray-300 pt-1">
            <span>IVA 5%: 0</span>
            <span>10%: {Math.round(total/11).toLocaleString()}</span>
            <span>TOT: {Math.round(total/11).toLocaleString()}</span>
        </div>
      </div>

      <div className="text-center pb-2">
        {copyLabel && <div className="font-black text-sm uppercase border-b border-black pb-1 mb-2">{copyLabel}</div>}
        <p className="font-bold text-xs whitespace-pre-wrap leading-tight">{storeData.ticketFooter}</p>
        <p className="text-[10px] italic mt-2">Sin valor fiscal</p>
      </div>
    </div>
  );
}