import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';

export default function ShiftCloseTicket({ shiftData, salesTotal, expensesTotal, cashCounted, finalDifference }) {
  const [storeData, setStoreData] = useState({ storeName: 'BODEGA EL GRIFO', address: '' });

  useEffect(() => {
    getDoc(doc(db, "settings", "general")).then(snap => {
        if(snap.exists()) setStoreData(snap.data());
    });
  }, []);

  const expectedCash = (parseFloat(shiftData?.startingCash) || 0) + parseFloat(salesTotal) - parseFloat(expensesTotal);

  return (
    <div className="font-mono text-xs text-gray-900 leading-snug bg-white w-full p-2">
      
      {/* HEADER */}
      <div className="text-center mb-3">
        <h1 className="text-xl font-black mb-1 uppercase">{storeData.storeName}</h1>
        <p className="font-bold">CIERRE DE CAJA (CORTE Z)</p>
        <p>{new Date().toLocaleDateString()} - {new Date().toLocaleTimeString()}</p>
        <div className="border-b-2 border-dashed border-gray-800 my-2"></div>
      </div>

      {/* INFO TURNO */}
      <div className="mb-3 space-y-1">
        <div className="flex justify-between"><span>CAJERO:</span><span className="font-bold uppercase">{shiftData?.userName}</span></div>
        <div className="flex justify-between"><span>APERTURA:</span><span>{shiftData?.openTime?.toDate().toLocaleTimeString()}</span></div>
        <div className="flex justify-between"><span>CIERRE:</span><span>{new Date().toLocaleTimeString()}</span></div>
      </div>

      <div className="border-b border-dashed border-gray-400 my-2"></div>

      {/* RESUMEN FINANCIERO */}
      <div className="space-y-1 font-medium">
        <div className="flex justify-between">
            <span>FONDO INICIAL (+):</span>
            <span>{parseFloat(shiftData?.startingCash || 0).toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
            <span>VENTAS TOTALES (+):</span>
            <span>{salesTotal.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-red-600">
            <span>GASTOS/RETIROS (-):</span>
            <span>{expensesTotal.toLocaleString()}</span>
        </div>
      </div>

      <div className="border-b-2 border-dashed border-gray-800 my-2"></div>

      {/* TOTALES */}
      <div className="space-y-2">
        <div className="flex justify-between font-black text-sm">
            <span>TOTAL ESPERADO:</span>
            <span>₲ {expectedCash.toLocaleString()}</span>
        </div>
      </div>

      {/* ESPACIO PARA FIRMA */}
      <div className="mt-8 text-center">
        <div className="border-t border-black w-3/4 mx-auto mb-1"></div>
        <p>Firma Cajero/a</p>
      </div>
    </div>
  );
}