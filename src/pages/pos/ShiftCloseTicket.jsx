import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Loader2 } from 'lucide-react';

export default function ShiftCloseTicket({ shiftData, salesTotal, expensesTotal }) {
  const [storeData, setStoreData] = useState({ storeName: 'BODEGA EL GRIFO', address: '' });
  const [globalData, setGlobalData] = useState({ startCapital: 0, endCapital: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initData = async () => {
        try {
            // 1. Cargar Configuración
            const configSnap = await getDoc(doc(db, "settings", "general"));
            if(configSnap.exists()) setStoreData(configSnap.data());

            // 2. Calcular Capital Global en Tiempo Real
            // Traemos todas las ventas y gastos históricos para obtener el "Capital Acumulado" exacto
            const salesSnap = await getDocs(collection(db, "sales"));
            const expensesSnap = await getDocs(collection(db, "shift_movements"));

            const totalGlobalSales = salesSnap.docs.reduce((acc, d) => {
                const data = d.data();
                return data.status !== 'canceled' ? acc + (data.total || 0) : acc;
            }, 0);

            const totalGlobalExpenses = expensesSnap.docs.reduce((acc, d) => {
                const data = d.data();
                return (data.type === 'expense' && data.status !== 'canceled') ? acc + (data.amount || 0) : acc;
            }, 0);

            // Capital Actual (Total Esperado)
            const currentGlobalCapital = totalGlobalSales - totalGlobalExpenses;

            // Capital Inicial (Antes de este turno)
            // Restamos lo que vendió este turno y sumamos lo que gastó este turno para "volver atrás"
            const startGlobalCapital = currentGlobalCapital - parseFloat(salesTotal || 0) + parseFloat(expensesTotal || 0);

            setGlobalData({
                startCapital: startGlobalCapital,
                endCapital: currentGlobalCapital
            });

        } catch (error) {
            console.error("Error calculando totales:", error);
        } finally {
            setLoading(false);
        }
    };

    initData();
  }, [salesTotal, expensesTotal]);

  // Datos locales del turno (Caja Chica)
  const drawerFund = parseFloat(shiftData?.startingCash || 0);

  if (loading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin"/></div>;

  return (
    <div className="font-mono text-xs text-gray-900 leading-snug bg-white w-full p-4 border border-gray-200">
      
      {/* HEADER TICKET */}
      <div className="text-center mb-4">
        <h1 className="text-xl font-black mb-1 uppercase">{storeData.storeName}</h1>
        <p className="font-bold text-gray-600">CIERRE DE CAJA (CORTE Z)</p>
        <p className="text-[10px] text-gray-500 mt-1">
            {new Date().toLocaleDateString()} - {new Date().toLocaleTimeString()}
        </p>
        <div className="border-b-2 border-dashed border-gray-300 my-3"></div>
      </div>

      {/* INFO TURNO */}
      <div className="mb-4 space-y-1.5 text-xs">
        <div className="flex justify-between">
            <span className="text-gray-500">CAJERO:</span>
            <span className="font-bold uppercase text-gray-800">{shiftData?.userName}</span>
        </div>
        <div className="flex justify-between">
            <span className="text-gray-500">APERTURA:</span>
            <span>{shiftData?.openTime?.toDate().toLocaleTimeString()}</span>
        </div>
        <div className="flex justify-between">
            <span className="text-gray-500">CIERRE:</span>
            <span>{new Date().toLocaleTimeString()}</span>
        </div>
        {/* Mostramos informativo el sencillo de caja, pero no suma al global */}
        <div className="flex justify-between text-gray-400 italic">
            <span>Fondo Caja (Sencillo):</span>
            <span>{drawerFund.toLocaleString()}</span>
        </div>
      </div>

      <div className="border-b border-gray-300 my-3"></div>

      {/* RESUMEN FINANCIERO GLOBAL */}
      <div className="space-y-2 font-medium text-sm">
        
        {/* CAPITAL GLOBAL INICIAL (Lo que había antes de abrir turno) */}
        <div className="flex justify-between items-center">
            <span className="text-gray-600">CAPITAL INICIAL (+):</span>
            <span className="font-bold text-gray-800">{globalData.startCapital.toLocaleString()}</span>
        </div>

        {/* VENTAS DEL TURNO */}
        <div className="flex justify-between items-center">
            <span className="text-gray-600">VENTAS TOTALES (+):</span>
            <span className="font-bold text-green-700">{parseFloat(salesTotal).toLocaleString()}</span>
        </div>

        {/* GASTOS DEL TURNO */}
        <div className="flex justify-between items-center">
            <span className="text-gray-600">GASTOS/RETIROS (-):</span>
            <span className="font-bold text-red-600">{expensesTotal > 0 ? '-' : ''}{parseFloat(expensesTotal).toLocaleString()}</span>
        </div>
      </div>

      <div className="border-b-2 border-dashed border-gray-800 my-3"></div>

      {/* TOTAL GLOBAL ESPERADO (Debe coincidir con Admin) */}
      <div className="space-y-2">
        <div className="flex justify-between items-center font-black text-base">
            <span>TOTAL ESPERADO:</span>
            <span className="bg-gray-100 px-2 py-1 rounded">₲ {globalData.endCapital.toLocaleString()}</span>
        </div>
        <p className="text-[10px] text-center text-gray-400 mt-1 uppercase">* Capital Total Acumulado *</p>
      </div>

      {/* ESPACIO PARA FIRMA */}
      <div className="mt-12 text-center">
        <div className="border-t border-black w-3/4 mx-auto mb-2"></div>
        <p className="text-[10px] font-bold text-gray-400 uppercase">Firma Cajero/a</p>
      </div>
    </div>
  );
}