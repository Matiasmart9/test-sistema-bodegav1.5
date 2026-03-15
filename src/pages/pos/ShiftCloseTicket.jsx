import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Loader2 } from 'lucide-react';

const g    = (n) => `\u20b2 ${Math.round(n || 0).toLocaleString('es-PY')}`;
const Line = () => <div className="border-b border-dashed border-gray-400 my-2.5"/>;
const Row  = ({ label, value, bold, color, indent }) => (
  <div className={`flex justify-between items-center text-xs ${indent ? 'pl-3' : ''}`}>
    <span className={bold ? 'text-gray-800' : 'text-gray-500'}>{label}</span>
    <span className={`${bold ? 'font-black' : 'font-medium'} ${color || 'text-gray-800'}`}>{value}</span>
  </div>
);

export default function ShiftCloseTicket({ shiftData, salesTotal, expensesTotal }) {
  const [storeData,   setStoreData]   = useState({ storeName: 'BODEGA EL GRIFO', address: '', storeRuc: '' });
  const [shiftDetail, setShiftDetail] = useState(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    if (!shiftData?.id) return;
    const load = async () => {
      try {
        const configSnap = await getDoc(doc(db, 'settings', 'general'));
        if (configSnap.exists()) setStoreData(configSnap.data());

        const salesSnap = await getDocs(
          query(collection(db, 'sales'), where('shiftId', '==', shiftData.id))
        );

        let cash = 0, qr = 0, card = 0, transfer = 0;
        let canceledCount = 0, canceledTotal = 0, discountTotal = 0, ticketCount = 0;

        salesSnap.docs.forEach(d => {
          const s = d.data();
          if (s.status === 'canceled') { canceledCount++; canceledTotal += parseFloat(s.total || 0); return; }
          ticketCount++;
          discountTotal += parseFloat(s.discountTotal || 0);
          const net = parseFloat(s.total || 0);
          if      (s.paymentMethod === 'qr')       qr       += net;
          else if (s.paymentMethod === 'card')     card     += net;
          else if (s.paymentMethod === 'transfer') transfer += net;
          else                                     cash     += net;
        });

        setShiftDetail({ ticketCount, canceledCount, canceledTotal, discountTotal, cash, qr, card, transfer });
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [shiftData?.id]);

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-gray-400"/></div>;

  const openTime      = shiftData?.openTime?.toDate ? shiftData.openTime.toDate() : new Date();
  const closeTime     = new Date();
  const startingCash  = parseFloat(shiftData?.startingCash || 0);
  const salesNet      = parseFloat(salesTotal   || 0);
  const expensesNet   = parseFloat(expensesTotal || 0);
  const digitalTotal  = (shiftDetail?.qr || 0) + (shiftDetail?.card || 0) + (shiftDetail?.transfer || 0);
  const cashToDeliver = startingCash + (shiftDetail?.cash || 0) - expensesNet;
  const resultado     = salesNet - expensesNet;

  const fmt = (d) => d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="font-mono text-[11px] text-gray-900 leading-relaxed bg-white w-full p-4">

      <div className="text-center mb-3">
        <p className="text-sm font-black uppercase tracking-wider">{storeData.storeName}</p>
        {storeData.address  && <p className="text-[10px] text-gray-500 mt-0.5">{storeData.address}</p>}
        {storeData.storeRuc && <p className="text-[10px] text-gray-500">RUC: {storeData.storeRuc}</p>}
        <p className="font-bold text-gray-600 mt-1.5 tracking-widest text-xs">CORTE Z - CIERRE DE TURNO</p>
        <p className="text-[10px] text-gray-400">
          {closeTime.toLocaleDateString('es-PY')} {fmt(closeTime)}
        </p>
      </div>

      <Line/>

      <div className="space-y-1 mb-1">
        <Row label="CAJERO:"    value={(shiftData?.userName || '').toUpperCase()} bold />
        <Row label="APERTURA:"  value={fmt(openTime)} />
        <Row label="CIERRE:"    value={fmt(closeTime)} />
        <Row label="TICKETS:"   value={`${shiftDetail?.ticketCount || 0} emitidos`} />
        {(shiftDetail?.canceledCount || 0) > 0 && (
          <Row label="ANULADOS:" value={`${shiftDetail.canceledCount} (${g(shiftDetail.canceledTotal)})`} color="text-red-500" />
        )}
      </div>

      <Line/>

      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Cobros del Turno</p>
      <div className="space-y-1">
        <Row label="  Efectivo:"       value={g(shiftDetail?.cash     || 0)} indent />
        <Row label="  QR:"             value={g(shiftDetail?.qr       || 0)} indent />
        <Row label="  Tarjeta:"        value={g(shiftDetail?.card     || 0)} indent />
        <Row label="  Transferencia:"  value={g(shiftDetail?.transfer || 0)} indent />
      </div>
      <div className="flex justify-between font-black text-xs mt-1.5 pt-1.5 border-t border-gray-200">
        <span>TOTAL COBRADO:</span>
        <span className="text-green-700">{g(salesNet)}</span>
      </div>
      {(shiftDetail?.discountTotal || 0) > 0 && (
        <Row label="Descuentos aplicados:" value={`- ${g(shiftDetail.discountTotal)}`} color="text-orange-500" />
      )}

      <Line/>

      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Caja Efectivo</p>
      <div className="space-y-1">
        <Row label="  Fondo inicial:"    value={g(startingCash)}                  indent />
        <Row label="  Ventas efectivo:"  value={`+ ${g(shiftDetail?.cash || 0)}`} color="text-green-700" indent />
        {expensesNet > 0 && (
          <Row label="  Gastos/Retiros:" value={`- ${g(expensesNet)}`}            color="text-red-500" indent />
        )}
      </div>
      <div className="flex justify-between font-black text-sm mt-1.5 pt-1.5 border-t-2 border-dashed border-gray-700">
        <span>ENTREGAR EFECTIVO:</span>
        <span className="bg-gray-100 px-1.5 py-0.5 rounded">{g(cashToDeliver)}</span>
      </div>
      {digitalTotal > 0 && (
        <div className="flex justify-between font-bold text-xs mt-1 text-blue-700">
          <span>DIGITAL (QR/Tarjeta/Transf.):</span>
          <span>{g(digitalTotal)}</span>
        </div>
      )}

      <Line/>

      <div className="space-y-1">
        <Row label="VENTAS NETAS:"  value={g(salesNet)}          bold color="text-green-700" />
        {expensesNet > 0 && (
          <Row label="GASTOS:"      value={`- ${g(expensesNet)}`}     color="text-red-500" />
        )}
        <div className="flex justify-between font-black text-sm pt-1.5 border-t border-gray-300 mt-1">
          <span>RESULTADO TURNO:</span>
          <span className={resultado >= 0 ? 'text-green-700' : 'text-red-600'}>{g(resultado)}</span>
        </div>
      </div>

      <div className="mt-8 text-center">
        <div className="border-t border-black w-3/4 mx-auto mb-1.5"/>
        <p className="text-[10px] font-bold text-gray-400 uppercase">{shiftData?.userName} - Firma</p>
      </div>
      <p className="text-[9px] text-center text-gray-300 mt-3 tracking-widest uppercase">Sistema Bodega El Grifo</p>
    </div>
  );
}