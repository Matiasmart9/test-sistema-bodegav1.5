import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Clock, User, DollarSign, Calendar, ChevronDown, ChevronUp, Loader2, Wallet, FileSpreadsheet, ChevronLeft, ChevronRight, TrendingUp, Tag } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function ShiftHistory() {
  const [allShifts, setAllShifts] = useState([]); 
  const [filteredShifts, setFilteredShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estado para detalles expandidos
  const [expandedShiftId, setExpandedShiftId] = useState(null);
  const [shiftDetails, setShiftDetails] = useState(null); 
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [generatingExcel, setGeneratingExcel] = useState(false);

  // PAGINACIÓN
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // FILTROS
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // 1. CARGAR TODOS LOS TURNOS
  useEffect(() => {
    const fetchShifts = async () => {
      try {
        const q = query(collection(db, "shifts"), orderBy("openTime", "desc"));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          openDate: doc.data().openTime?.toDate(),
          closeDate: doc.data().closeTime?.toDate(),
        }));
        setAllShifts(data);
        setFilteredShifts(data);
      } catch (error) {
        console.error("Error cargando turnos:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchShifts();
  }, []);

  // 2. APLICAR FILTRO DE FECHAS
  useEffect(() => {
    if (dateRange.start && dateRange.end) {
      const start = new Date(dateRange.start);
      start.setHours(0, 0, 0, 0); 
      const end = new Date(dateRange.end);
      end.setHours(23, 59, 59, 999); 

      const results = allShifts.filter(shift => {
        const shiftDate = shift.openDate;
        return shiftDate >= start && shiftDate <= end;
      });
      setFilteredShifts(results);
    } else {
      setFilteredShifts(allShifts);
    }
    setCurrentPage(1); 
  }, [dateRange, allShifts]);

  // 3. PAGINACIÓN
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredShifts.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredShifts.length / itemsPerPage);

  // 4. EXPORTAR A EXCEL (CON CÁLCULO DE DESCUENTOS Y HORA DE CIERRE)
  const handleExportExcel = async () => {
    setGeneratingExcel(true);
    try {
        // Preparamos los datos línea por línea
        const dataToExport = await Promise.all(filteredShifts.map(async (shift) => {
            
            // Consultamos las ventas para sumar descuentos y recalcular ganancia exacta
            const qSales = query(collection(db, "sales"), where("shiftId", "==", shift.id));
            const salesSnap = await getDocs(qSales);
            
            let totalDiscountShift = 0;
            let finalProfit = 0;

            salesSnap.docs.forEach(doc => {
                const s = doc.data();
                // Sumar descuentos
                totalDiscountShift += (s.discountTotal || 0);
                
                // Calcular ganancia real (Precio - Costo - Descuento)
                const saleProfit = s.items?.reduce((pAcc, item) => pAcc + (((item.price||0) - (item.cost||0)) * (item.quantity||0)), 0) || 0;
                finalProfit += (saleProfit - (s.discountTotal || 0));
            });

            // Si el turno ya tenía profitTotal guardado y no hay ventas en snapshot (caso raro), usamos ese como backup
            if (salesSnap.empty && shift.profitTotal !== undefined) {
                finalProfit = shift.profitTotal;
            }

            return {
                'Cajero': shift.userName,
                'Estado': shift.status === 'open' ? 'ABIERTO' : 'CERRADO',
                'Fecha Apertura': shift.openDate?.toLocaleDateString(),
                'Hora Apertura': shift.openDate?.toLocaleTimeString(),
                'Fecha Cierre': shift.closeDate?.toLocaleDateString() || '-',
                'Hora Cierre': shift.closeDate?.toLocaleTimeString() || '-', // <--- NUEVA COLUMNA AGREGADA
                'Base Inicial': shift.startingCash || 0,
                
                // Columnas Financieras
                'Venta Bruta (Est.)': (shift.salesTotal || 0) + totalDiscountShift, // Lo que hubiera sido sin descuento
                'Descuentos (-)': totalDiscountShift,
                'Total Neto Vendido': shift.salesTotal || 0, // Lo que realmente entró
                
                'Ganancia Neta': finalProfit,
                'Total Caja (Base+Ventas)': (shift.startingCash || 0) + (shift.salesTotal || 0)
            };
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Historial Cajas");
        XLSX.writeFile(wb, `Cajas_${new Date().toISOString().slice(0,10)}.xlsx`);
    
    } catch (error) {
        console.error("Error exportando:", error);
        alert("Error al generar el Excel");
    } finally {
        setGeneratingExcel(false);
    }
  };

  // 5. EXPANDIR DETALLES (CALCULAR DESCUENTOS)
  const handleExpand = async (shift) => {
    if (expandedShiftId === shift.id) {
      setExpandedShiftId(null);
      return;
    }

    setExpandedShiftId(shift.id);
    setLoadingDetails(true);
    setShiftDetails(null);

    try {
      const q = query(collection(db, "sales"), where("shiftId", "==", shift.id));
      const snapshot = await getDocs(q);
      
      let cash = 0, qr = 0, card = 0, transfer = 0;
      let profitCalc = 0;
      let totalDiscounts = 0;

      snapshot.docs.forEach(doc => {
        const sale = doc.data();
        const total = parseFloat(sale.total || 0);
        
        // Sumar Totales por Método
        if (sale.paymentMethod === 'cash') cash += total;
        else if (sale.paymentMethod === 'qr') qr += total;
        else if (sale.paymentMethod === 'card') card += total;
        else if (sale.paymentMethod === 'transfer') transfer += total;

        // Sumar Descuentos
        totalDiscounts += (sale.discountTotal || 0);

        // Calcular Ganancia Real
        const saleProfit = sale.items?.reduce((acc, item) => acc + (((item.price||0) - (item.cost||0)) * (item.quantity||0)), 0) || 0;
        profitCalc += (saleProfit - (sale.discountTotal || 0));
      });

      setShiftDetails({
        cashTotal: cash,
        digitalTotal: qr + card + transfer,
        breakdown: { cash, qr, card, transfer },
        ticketCount: snapshot.size,
        calculatedProfit: profitCalc,
        totalDiscounts: totalDiscounts // Guardamos el total de descuentos
      });

    } catch (error) {
      console.error("Error detalles:", error);
    } finally {
      setLoadingDetails(false);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary"/></div>;

  return (
    <div className="max-w-5xl mx-auto pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-6 gap-4">
        <div>
            <h1 className="text-2xl font-bold text-gray-800">Historial de Cajas</h1>
            <p className="text-sm text-gray-500">Auditoría de turnos y rentabilidad.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
                <Calendar size={18} className="text-gray-400"/>
                <input type="date" value={dateRange.start} onChange={(e) => setDateRange({...dateRange, start: e.target.value})} className="text-sm font-medium text-gray-600 focus:outline-none"/>
                <span className="text-gray-400">-</span>
                <input type="date" value={dateRange.end} onChange={(e) => setDateRange({...dateRange, end: e.target.value})} className="text-sm font-medium text-gray-600 focus:outline-none"/>
            </div>

            <button 
                onClick={handleExportExcel}
                disabled={filteredShifts.length === 0 || generatingExcel}
                className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-green-700 disabled:opacity-50 shadow-sm transition-colors"
            >
                {generatingExcel ? <Loader2 className="animate-spin" size={18}/> : <FileSpreadsheet size={18}/>}
                {generatingExcel ? 'Generando...' : 'Excel'}
            </button>
        </div>
      </div>

      {/* LISTA */}
      <div className="space-y-4">
        {currentItems.map((shift) => {
          const isOpen = shift.status === 'open';
          const isExpanded = expandedShiftId === shift.id;
          
          // Visualización de ganancia en la tarjeta cerrada (aproximada si no se expande)
          const displayProfit = shift.profitTotal !== undefined ? shift.profitTotal : (isExpanded && shiftDetails ? shiftDetails.calculatedProfit : 0);

          return (
            <div key={shift.id} className={`bg-white rounded-xl border transition-all overflow-hidden ${isExpanded ? 'border-primary shadow-md' : 'border-gray-200 shadow-sm'}`}>
              
              {/* CABECERA DE LA TARJETA */}
              <div onClick={() => handleExpand(shift)} className="p-5 flex flex-col md:flex-row items-center justify-between cursor-pointer hover:bg-gray-50 gap-4">
                
                {/* Info Cajero */}
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0 ${isOpen ? 'bg-green-500' : 'bg-gray-600'}`}>
                        {shift.userName?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            {shift.userName}
                            {isOpen && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200 uppercase tracking-wide">Turno Actual</span>}
                        </h3>
                        <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                            <span className="flex items-center gap-1"><Calendar size={12}/> {shift.openDate?.toLocaleDateString()}</span>
                            <span className="flex items-center gap-1"><Clock size={12}/> {shift.openDate?.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                        </div>
                    </div>
                </div>

                {/* Resumen Rápido */}
                <div className="flex items-center gap-8 w-full md:w-auto justify-between md:justify-end">
                    <div className="text-right hidden sm:block">
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Base Inicial</p>
                        <p className="font-medium text-gray-500">₲ {(shift.startingCash || 0).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total Vendido</p>
                        <p className="font-black text-lg text-gray-800">₲ {(shift.salesTotal || 0).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider text-green-600">Ganancia Neta</p>
                        <p className="font-bold text-lg text-green-600">₲ {displayProfit.toLocaleString()}</p>
                    </div>
                    
                    <div className="text-gray-400 pl-2">
                        {isExpanded ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                    </div>
                </div>
              </div>

              {/* DETALLES EXPANDIDOS */}
              {isExpanded && (
                <div className="bg-gray-50 border-t border-gray-100 p-6 animate-fadeIn">
                    {loadingDetails ? (
                        <div className="flex justify-center py-4"><Loader2 className="animate-spin text-gray-400"/></div>
                    ) : shiftDetails ? (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4"> 
                            
                            {/* COLUMNA 1: EFECTIVO */}
                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm md:col-span-1">
                                <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><Wallet className="text-green-600" size={18}/> Efectivo</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between text-gray-500"><span>Base</span><span>₲ {(shift.startingCash || 0).toLocaleString()}</span></div>
                                    <div className="flex justify-between text-green-700 font-bold"><span>Ventas</span><span>₲ {shiftDetails.breakdown.cash.toLocaleString()}</span></div>
                                    <div className="border-t border-dashed border-gray-300 my-2 pt-2 flex justify-between font-black text-gray-800">
                                        <span>ENTREGAR:</span>
                                        <span>₲ {((shift.startingCash || 0) + shiftDetails.breakdown.cash).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                            {/* COLUMNA 2: DIGITAL */}
                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm md:col-span-1">
                                <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><DollarSign className="text-blue-600" size={18}/> Digital</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between text-gray-500"><span>QR</span><span>₲ {shiftDetails.breakdown.qr.toLocaleString()}</span></div>
                                    <div className="flex justify-between text-gray-500"><span>Tarjeta</span><span>₲ {shiftDetails.breakdown.card.toLocaleString()}</span></div>
                                    <div className="flex justify-between text-gray-500"><span>Transf.</span><span>₲ {shiftDetails.breakdown.transfer.toLocaleString()}</span></div>
                                    <div className="border-t border-dashed border-gray-300 my-2 pt-2 flex justify-between font-bold text-blue-600">
                                        <span>TOTAL:</span><span>₲ {shiftDetails.digitalTotal.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                            {/* COLUMNA 3: DESCUENTOS */}
                            <div className="bg-white p-4 rounded-xl border border-red-100 bg-red-50/20 shadow-sm text-center flex flex-col justify-center md:col-span-1">
                                <Tag className="mx-auto text-red-400 mb-2" size={24}/>
                                <p className="text-xs text-gray-400 font-bold uppercase">Total Descontado</p>
                                <p className="text-2xl font-black text-red-500 my-1">- ₲ {shiftDetails.totalDiscounts.toLocaleString()}</p>
                                <p className="text-[10px] text-gray-400">Descuentos aplicados en el turno</p>
                            </div>

                            {/* COLUMNA 4: RENTABILIDAD */}
                            <div className="bg-white p-4 rounded-xl border border-green-100 bg-green-50/20 shadow-sm text-center flex flex-col justify-center md:col-span-1">
                                <TrendingUp className="mx-auto text-green-500 mb-2" size={24}/>
                                <p className="text-xs text-gray-400 font-bold uppercase">Rentabilidad Neta</p>
                                <p className="text-3xl font-black text-green-600 my-1">₲ {shiftDetails.calculatedProfit.toLocaleString()}</p>
                                <p className="text-[10px] text-gray-400">{shiftDetails.ticketCount} tickets emitidos</p>
                            </div>

                        </div>
                    ) : <p className="text-center text-gray-400">Sin ventas registradas.</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* FOOTER PAGINACIÓN */}
      <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-200">
          <span className="text-sm text-gray-500">Mostrando {indexOfFirstItem + 1} - {Math.min(indexOfLastItem, filteredShifts.length)} de {filteredShifts.length}</span>
          <div className="flex gap-2">
              <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} className="p-2 border rounded hover:bg-gray-50 disabled:opacity-50"><ChevronLeft size={20}/></button>
              <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="p-2 border rounded hover:bg-gray-50 disabled:opacity-50"><ChevronRight size={20}/></button>
          </div>
      </div>
    </div>
  );
}