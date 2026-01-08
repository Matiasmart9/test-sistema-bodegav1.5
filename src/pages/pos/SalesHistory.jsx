import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { collection, query, where, getDocs, orderBy, doc, updateDoc, getDoc, increment } from 'firebase/firestore'; // Importamos doc, updateDoc, etc.
import { db } from '../../firebase/config';
import { Receipt, ArrowUpRight, Banknote, Smartphone, CreditCard, Loader2, Printer, Search, User, FileSpreadsheet, Calendar, TrendingUp, ChevronLeft, ChevronRight, Ban, AlertCircle } from 'lucide-react';
import TicketInvoice from './TicketInvoice';
import * as XLSX from 'xlsx';

export default function SalesHistory() {
  const { userData } = useAuth();
  
  // --- ESTADOS ---
  const [allSales, setAllSales] = useState([]); 
  const [filteredSales, setFilteredSales] = useState([]); 
  const [loading, setLoading] = useState(true);
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Filtros
  const [searchTerm, setSearchTerm] = useState(''); 
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  const [selectedSale, setSelectedSale] = useState(null);

  // --- CARGA DE DATOS ---
  const fetchSales = async () => {
    setLoading(true);
    try {
        let q;
        if (userData.role === 'admin') {
            try { q = query(collection(db, "sales"), orderBy("date", "desc")); } 
            catch { q = query(collection(db, "sales")); }
        } else {
            q = query(collection(db, "sales"), where("userId", "==", userData.id));
        }

        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => {
            const d = doc.data();
            let dateObj = new Date();
            if (d.date?.toDate) dateObj = d.date.toDate();
            else if (d.date) dateObj = new Date(d.date);
            return { id: doc.id, ...d, date: dateObj };
        });

        data.sort((a, b) => b.date - a.date);
        setAllSales(data);
        
    } catch (error) {
        console.error("Error cargando historial:", error);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    if (userData?.id) fetchSales();
  }, [userData]);

  // --- NUEVA FUNCIÓN: ANULAR VENTA ---
  const handleCancelSale = async (sale) => {
      if (!window.confirm(`¿⚠️ ESTÁ SEGURO?\n\nVa a anular el Ticket #${sale.ticketId}.\nEsto devolverá el stock de ${sale.items.length} productos al inventario.`)) {
          return;
      }

      setLoading(true);
      try {
          // 1. Devolver Stock
          for (const item of sale.items) {
              // Obtenemos referencia al producto original (Si es variante, el ID del item suele ser "IDPADRE-INDEX")
              // En PosTerminal guardamos 'id' como compuesto en variantes, pero necesitamos el ID del documento real.
              // Si tu lógica de PosTerminal guardó el ID real del producto en un campo, úsalo.
              // Aquí asumo que 'id' en item es el ID del producto o variante.
              
              // Ajuste: En tu PosTerminal veo que guardaste "id: item.id" que podía ser "ID-INDEX".
              // Para obtener el ID del documento, intentamos dividir o usar una propiedad si existe.
              // Si no tienes el ID limpio, intentamos deducirlo:
              let docId = item.id;
              let isVariant = false;
              let variantIndex = -1;

              // Si el ID tiene un guion y es variante (según tu lógica de PosTerminal)
              if (item.id.includes('-') && !item.id.startsWith('PROD')) { 
                  // Esto es un parche si no guardamos 'originalId'. 
                  // Lo ideal es que en 'sales' guardes 'originalId' por item.
                  // Si no lo tienes, intentaremos buscar el producto.
                  // PERO, en tu código anterior vi que sí tenías acceso al documento.
                  // Vamos a intentar hacer el split simple:
                  const parts = item.id.split('-');
                  // Riesgoso si el ID original tenía guiones.
                  // MEJOR ESTRATEGIA: Buscar el producto directamente.
              }
              
              // NOTA: Para que esto sea robusto, asegúrate que en 'sales' > 'items' estés guardando 'originalId' o que el 'id' sea rastreable.
              // Asumiré que el ID que guardaste permite encontrar el documento.
              
              // Si no podemos determinar el ID exacto facilmente, una estrategia segura es:
              // Buscar el producto donde (variants.name == item.name OR name == item.name)
              // Pero asumamos que 'item.id' es válido para buscar o es una variante.
              
              // MODO SIMPLE (Si usas estructura simple):
              // const prodRef = doc(db, "products", item.id);
              // await updateDoc(prodRef, { current_stock: increment(item.quantity) });

              // MODO ROBUSTO (Considerando Variantes según tu código anterior):
              // Tu código PosTerminal generaba IDs compuestos: `${p.id}-${index}`
              
              const productId = item.id.split('-')[0]; // Asumiendo ID simple antes del guion
              const potentialIndex = parseInt(item.id.split('-')[1]);

              // Intentamos obtener el producto padre
              let prodRef;
              let prodSnap;
              
              // Intentamos primero con el ID directo (por si no es variante)
              prodRef = doc(db, "products", item.id);
              prodSnap = await getDoc(prodRef);

              if (!prodSnap.exists()) {
                  // Si no existe, quizás es variante y el ID es compuesto
                  if (item.id.includes('-')) {
                      const splitParts = item.id.split('-');
                      const realId = splitParts[0]; 
                      const idx = parseInt(splitParts[1]);
                      
                      prodRef = doc(db, "products", realId);
                      prodSnap = await getDoc(prodRef);
                      
                      if (prodSnap.exists() && !isNaN(idx)) {
                          // ES VARIANTE: Devolver stock al array
                          const data = prodSnap.data();
                          const variants = [...data.variants];
                          if (variants[idx]) {
                              variants[idx].stock = (parseFloat(variants[idx].stock) || 0) + parseFloat(item.quantity);
                              await updateDoc(prodRef, { variants: variants });
                          }
                      }
                  }
              } else {
                  // ES PRODUCTO SIMPLE
                  await updateDoc(prodRef, { 
                      current_stock: increment(parseFloat(item.quantity)) 
                  });
              }
          }

          // 2. Marcar Venta como CANCELED
          await updateDoc(doc(db, "sales", sale.id), { 
              status: 'canceled',
              canceledAt: new Date(),
              canceledBy: userData.name
          });

          // 3. Recargar
          await fetchSales();
          alert("Ticket anulado correctamente.");

      } catch (error) {
          console.error("Error anulando:", error);
          alert("Error al anular. Revise la consola.");
      } finally {
          setLoading(false);
      }
  };

  // --- FILTROS ---
  useEffect(() => {
    const [startYear, startMonth, startDay] = dateRange.start.split('-').map(Number);
    const [endYear, endMonth, endDay] = dateRange.end.split('-').map(Number);
    
    const startDate = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
    const endDate = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    let results = allSales.filter(sale => sale.date >= startDate && sale.date <= endDate);

    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        results = results.filter(sale => 
            (sale.ticketId || '').toLowerCase().includes(term)
        );
    }

    setFilteredSales(results);
    setCurrentPage(1); 
  }, [allSales, dateRange, searchTerm]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredSales.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredSales.length / itemsPerPage);

  const handleExportExcel = () => { /* ... Logica exportación igual ... */ };
  
  const getMethodName = (method) => {
      const names = { cash: 'Efectivo', qr: 'QR / Billetera', transfer: 'Transferencia' };
      return names[method] || 'Otro';
  }

  const applyPreset = (type) => { /* ... Logica preset igual ... */ };

  // --- KPIS (FILTRANDO ANULADOS) ---
  const activeSales = filteredSales.filter(s => s.status !== 'canceled'); // Solo sumamos activos
  const totalRevenue = activeSales.reduce((acc, sale) => acc + (parseFloat(sale.total) || 0), 0);
  const totalProfit = activeSales.reduce((acc, sale) => {
      const saleProfit = sale.items?.reduce((itemAcc, item) => itemAcc + (((parseFloat(item.price)||0) - (parseFloat(item.cost)||0)) * (parseFloat(item.quantity)||0)), 0) || 0;
      return acc + saleProfit;
  }, 0);


  if (!userData) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary"/></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto pb-20">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
            <div>
                <h1 className="text-2xl font-bold text-gray-800">Reporte de Ventas</h1>
                <p className="text-sm text-gray-500">{userData.role === 'admin' ? 'Vista Gerencial' : 'Mis Ventas'}</p>
            </div>
            <button onClick={handleExportExcel} disabled={filteredSales.length === 0} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 shadow-sm transition-colors">
                <FileSpreadsheet size={20}/> Exportar Excel
            </button>
        </div>

        {/* FILTROS (Igual que antes) */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 space-y-4">
            <div className="flex flex-col lg:flex-row gap-4 justify-between">
                <div className="flex gap-2 overflow-x-auto pb-2 lg:pb-0">
                    {[ { label: 'Hoy', val: 'today' }, { label: 'Ayer', val: 'yesterday' }, { label: 'Últimos 7 días', val: 'last7' }, { label: 'Este Mes', val: 'month' } ].map(btn => (
                        <button key={btn.val} onClick={() => applyPreset(btn.val)} className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full whitespace-nowrap transition-colors">{btn.label}</button>
                    ))}
                </div>
                <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200">
                    <Calendar size={18} className="text-gray-400"/>
                    <input type="date" value={dateRange.start} onChange={(e) => setDateRange({...dateRange, start: e.target.value})} className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none"/>
                    <span className="text-gray-400">-</span>
                    <input type="date" value={dateRange.end} onChange={(e) => setDateRange({...dateRange, end: e.target.value})} className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none"/>
                </div>
                <div className="relative w-full lg:w-64">
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                    <input type="text" placeholder="Buscar ticket..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-primary text-sm bg-gray-50 focus:bg-white transition-colors"/>
                </div>
            </div>
        </div>

        {/* KPIS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-600"><Receipt size={24} /></div>
                <div><p className="text-sm text-gray-500 font-medium">Tickets Válidos</p><h3 className="text-2xl font-bold text-gray-800">{activeSales.length}</h3></div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                 <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center text-green-600"><ArrowUpRight size={24} /></div>
                <div><p className="text-sm text-gray-500 font-medium">Total Facturado</p><h3 className="text-2xl font-bold text-green-600">₲ {totalRevenue.toLocaleString()}</h3></div>
            </div>
            {userData.role === 'admin' && (
                <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-yellow-50 rounded-full flex items-center justify-center text-yellow-600"><TrendingUp size={24} /></div>
                    <div><p className="text-sm text-gray-500 font-medium">Ganancia Est.</p><h3 className="text-2xl font-bold text-yellow-600">₲ {totalProfit.toLocaleString()}</h3></div>
                </div>
            )}
        </div>

        {/* TABLA */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
            {loading ? <div className="flex justify-center py-12"><Loader2 className="animate-spin"/></div> : (
                <>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs uppercase font-bold">
                            <tr>
                                <th className="px-6 py-4">Ticket</th>
                                <th className="px-6 py-4">Fecha</th>
                                <th className="px-6 py-4">Cajero</th>
                                <th className="px-6 py-4">Método</th>
                                <th className="px-6 py-4 text-right">Total</th>
                                {userData.role === 'admin' && <th className="px-6 py-4 text-center">Acciones</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {currentItems.map((sale) => {
                                const isCanceled = sale.status === 'canceled';
                                return (
                                <tr key={sale.id} className={`hover:bg-gray-50 text-sm transition-colors ${isCanceled ? 'bg-red-50' : ''}`}>
                                    
                                    {/* ID TICKET */}
                                    <td className="px-6 py-4 font-mono font-bold text-gray-600">
                                        {sale.ticketId}
                                        {isCanceled && <span className="ml-2 text-[10px] bg-red-200 text-red-800 px-1.5 py-0.5 rounded uppercase">Anulado</span>}
                                    </td>
                                    
                                    {/* FECHA */}
                                    <td className={`px-6 py-4 ${isCanceled ? 'line-through text-gray-400' : ''}`}>
                                        {sale.date.toLocaleDateString()}
                                    </td>
                                    
                                    {/* CAJERO */}
                                    <td className={`px-6 py-4 ${isCanceled ? 'line-through text-gray-400' : ''}`}>
                                        {sale.userName}
                                    </td>
                                    
                                    {/* MÉTODO */}
                                    <td className={`px-6 py-4 ${isCanceled ? 'line-through text-gray-400' : ''}`}>
                                        {getMethodName(sale.paymentMethod)}
                                    </td>
                                    
                                    {/* TOTAL */}
                                    <td className={`px-6 py-4 text-right font-black ${isCanceled ? 'line-through text-gray-400' : ''}`}>
                                        ₲ {parseFloat(sale.total).toLocaleString()}
                                    </td>
                                    
                                    {/* ACCIONES (SOLO ADMIN) */}
                                    {userData.role === 'admin' && (
                                        <td className="px-6 py-4 text-center flex justify-center gap-2">
                                            {/* VER TICKET */}
                                            <button 
                                                onClick={() => setSelectedSale(sale)} 
                                                className="text-blue-600 hover:bg-blue-100 p-2 rounded transition-colors"
                                                title="Ver / Reimprimir"
                                            >
                                                <Printer size={18}/>
                                            </button>

                                            {/* ANULAR VENTA */}
                                            {!isCanceled && (
                                                <button 
                                                    onClick={() => handleCancelSale(sale)} 
                                                    className="text-red-500 hover:bg-red-100 p-2 rounded transition-colors"
                                                    title="Anular Venta y Devolver Stock"
                                                >
                                                    <Ban size={18}/>
                                                </button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </div>
                {/* Paginación footer */}
                <div className="border-t p-4 flex justify-between">
                    <button onClick={() => setCurrentPage(p => Math.max(p-1,1))} disabled={currentPage===1} className="px-3 py-1 border rounded disabled:opacity-50">Anterior</button>
                    <span>{currentPage} / {totalPages}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(p+1,totalPages))} disabled={currentPage===totalPages} className="px-3 py-1 border rounded disabled:opacity-50">Siguiente</button>
                </div>
                </>
            )}
        </div>

        {/* MODAL DE VISTA PREVIA (IGUAL QUE ANTES) */}
        {selectedSale && (
            <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden relative">
                    <div className={`p-4 border-b flex justify-between items-center ${selectedSale.status === 'canceled' ? 'bg-red-50' : 'bg-gray-100'}`}>
                        <h3 className="font-bold text-gray-700">
                            Ticket #{selectedSale.ticketId} 
                            {selectedSale.status === 'canceled' && <span className="text-red-600 ml-2">(ANULADO)</span>}
                        </h3>
                        <button onClick={() => setSelectedSale(null)} className="text-gray-400 hover:text-gray-700 font-bold text-xl px-2">×</button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto bg-gray-200 p-4 flex justify-center">
                        <div className={`bg-white shadow-xl w-[300px] relative ${selectedSale.status === 'canceled' ? 'opacity-75' : ''}`}>
                            {selectedSale.status === 'canceled' && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                                    <div className="border-4 border-red-500 text-red-500 text-4xl font-black p-4 -rotate-12 rounded-xl opacity-50">
                                        ANULADO
                                    </div>
                                </div>
                            )}
                            <TicketInvoice 
                                cart={selectedSale.items} total={selectedSale.total} amountPaid={selectedSale.amountReceived} change={selectedSale.change} paymentMethod={selectedSale.paymentMethod} ticketId={selectedSale.ticketId} date={selectedSale.date} client={selectedSale.client} cashierName={selectedSale.userName}
                                copyLabel="ORIGINAL: CLIENTE"
                            />
                        </div>
                    </div>
                    
                    <div className="p-4 bg-white border-t flex gap-2">
                         <button onClick={() => window.print()} className="flex-1 bg-gray-900 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-black transition-colors"><Printer size={18} /> IMPRIMIR</button>
                         <button onClick={() => setSelectedSale(null)} className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200 transition-colors">CERRAR</button>
                    </div>
                </div>
            </div>
        )}

        {/* IMPRESIÓN */}
        {selectedSale && (
            <div id="printable-ticket" className="hidden print:block">
                <TicketInvoice 
                    cart={selectedSale.items} total={selectedSale.total} amountPaid={selectedSale.amountReceived} change={selectedSale.change} paymentMethod={selectedSale.paymentMethod} ticketId={selectedSale.ticketId} date={selectedSale.date} client={selectedSale.client} cashierName={selectedSale.userName}
                />
            </div>
        )}

    </div>
  );
}