import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, where, getAggregateFromServer, count } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { 
  DollarSign, ShoppingBag, Users, TrendingUp, 
  ArrowUpRight, Package, Calendar, Loader2, Filter, AlertTriangle, ChevronRight, CheckCircle // <--- AGREGADO AQUÍ
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { useNavigate } from 'react-router-dom';

export default function DashboardHome() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  
  // DATOS
  const [allSales, setAllSales] = useState([]);
  const [allClientsCount, setAllClientsCount] = useState(0);
  const [lowStockItems, setLowStockItems] = useState([]);

  // DATOS FILTRADOS
  const [stats, setStats] = useState({
    totalSales: 0,
    totalProfit: 0,
    totalOrders: 0,
    averageTicket: 0
  });
  
  const [chartData, setChartData] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [recentSales, setRecentSales] = useState([]);

  // FILTRO
  const [timeFilter, setTimeFilter] = useState('month'); // 'today', 'week', 'month', 'year', 'all'

  // 1. CARGA INICIAL (VENTAS, CLIENTES, PRODUCTOS)
  useEffect(() => {
    const fetchBaseData = async () => {
      setLoading(true);
      try {
        // A. VENTAS — solo los últimos 13 meses (cubre todos los filtros del dashboard)
        const salesRef   = collection(db, 'sales');
        const thirteenMonthsAgo = new Date();
        thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);

        const salesSnap = await getDocs(
            query(salesRef, where('date', '>=', thirteenMonthsAgo), orderBy('date', 'desc'))
        );
        const salesData = salesSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            dateObj: doc.data().date?.toDate ? doc.data().date.toDate() : new Date(doc.data().date)
        }));
        setAllSales(salesData);

        // B. CLIENTES — conteo del servidor (sin descargar documentos)
        const clientsAgg = await getAggregateFromServer(collection(db, 'clients'), { total: count() });
        setAllClientsCount(clientsAgg.data().total || 0);

        // C. PRODUCTOS (STOCK BAJO)
        const productsSnap = await getDocs(collection(db, "products"));
        const alerts = [];
        
        productsSnap.docs.forEach(doc => {
            const p = doc.data();
            const minStock = parseFloat(p.low_stock || 5);

            if (p.variants && p.variants.length > 0) {
                // Revisar variantes
                p.variants.forEach(v => {
                    const vStock = parseFloat(v.stock || 0);
                    const vMin = parseFloat(v.low_stock || minStock);
                    if (vStock <= vMin) {
                        alerts.push({
                            id: doc.id,
                            name: `${p.name} (${v.name})`,
                            stock: vStock,
                            min: vMin,
                            isVariant: true
                        });
                    }
                });
            } else {
                // Producto simple
                const stock = parseFloat(p.current_stock || 0);
                if (stock <= minStock) {
                    alerts.push({
                        id: doc.id,
                        name: p.name,
                        stock: stock,
                        min: minStock,
                        isVariant: false
                    });
                }
            }
        });
        setLowStockItems(alerts.slice(0, 5)); // Solo mostrar los primeros 5

      } catch (error) {
        console.error("Error dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBaseData();
  }, []);

  // 2. LOGICA DE FILTRADO Y CÁLCULOS
  useEffect(() => {
    if (loading) return;

    const now = new Date();
    
    // A. Filtrar ventas según el periodo seleccionado
    const filteredSales = allSales.filter(sale => {
        const d = sale.dateObj;
        
        if (timeFilter === 'all') return true;
        
        if (timeFilter === 'today') {
            return d.getDate() === now.getDate() && 
                   d.getMonth() === now.getMonth() && 
                   d.getFullYear() === now.getFullYear();
        }
        
        if (timeFilter === 'week') { 
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(now.getDate() - 7);
            return d >= sevenDaysAgo;
        }

        if (timeFilter === 'month') { 
            return d.getMonth() === now.getMonth() && 
                   d.getFullYear() === now.getFullYear();
        }

        if (timeFilter === 'year') { 
            return d.getFullYear() === now.getFullYear();
        }
        return true;
    });

    // B. Calcular KPI Totales
    let revenue = 0;
    let profit = 0;
    const productMap = {}; 
    const tempChartData = {}; 

    // Inicializar Eje X del gráfico
    if (timeFilter === 'month') {
       const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
       for(let i=1; i<=daysInMonth; i++) {
           const label = i < 10 ? `0${i}` : `${i}`;
           tempChartData[label] = { label, value: 0, sortKey: i };
       }
    } else if (timeFilter === 'week' || timeFilter === 'today') {
       for(let i=6; i>=0; i--) {
           const d = new Date();
           d.setDate(now.getDate() - i);
           const label = d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit'});
           tempChartData[label] = { label, value: 0, sortKey: d.getTime() }; 
       }
    } else if (timeFilter === 'year') {
        const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        months.forEach((m, idx) => {
            tempChartData[m] = { label: m, value: 0, sortKey: idx };
        });
    }

    filteredSales.forEach(sale => {
        // Sumar KPI
        revenue += parseFloat(sale.total || 0);

        // Ganancia estimada (Precio - Costo) * Cantidad - Descuentos
        let saleCost = 0;
        if (sale.items) {
            sale.items.forEach(item => {
                const c = parseFloat(item.cost || 0);
                const q = parseFloat(item.quantity || 0);
                saleCost += c * q;

                // Contar Producto para Top
                if (productMap[item.name]) productMap[item.name] += q;
                else productMap[item.name] = q;
            });
        }
        // Ganancia Neta de la venta = Total Cobrado - Costo Mercadería
        profit += (parseFloat(sale.total || 0) - saleCost);

        // Asignar al Gráfico
        let key;
        if (timeFilter === 'month') {
            key = sale.dateObj.getDate() < 10 ? `0${sale.dateObj.getDate()}` : `${sale.dateObj.getDate()}`;
        } else if (timeFilter === 'year') {
            const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
            key = months[sale.dateObj.getMonth()];
        } else {
            key = sale.dateObj.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit'});
        }

        if (tempChartData[key]) {
            tempChartData[key].value += parseFloat(sale.total || 0);
        } else if (timeFilter === 'all') {
            if (!tempChartData[key]) tempChartData[key] = { label: key, value: 0, sortKey: sale.dateObj.getTime() };
            tempChartData[key].value += parseFloat(sale.total || 0);
        }
    });

    const finalGraphData = Object.values(tempChartData)
        .sort((a, b) => a.sortKey - b.sortKey)
        .map(item => ({ name: item.label, ventas: item.value }));

    const topProdArray = Object.keys(productMap)
        .map(key => ({ name: key, quantity: productMap[key] }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

    setStats({
        totalSales: revenue,
        totalProfit: profit,
        totalOrders: filteredSales.length,
        averageTicket: filteredSales.length > 0 ? revenue / filteredSales.length : 0
    });
    setChartData(finalGraphData);
    setTopProducts(topProdArray);
    setRecentSales(filteredSales.slice(0, 5));

  }, [allSales, timeFilter, loading]);

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-primary" size={40} />
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto pb-20">
      
      {/* HEADER + FILTROS */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
        <div>
            <h1 className="text-2xl font-bold text-gray-800">Panel de Control</h1>
            <p className="text-sm text-gray-500">Resumen de rendimiento y alertas V1.8</p>
        </div>

        {/* SELECTOR DE FILTRO */}
        <div className="bg-white p-1 rounded-lg border border-gray-200 shadow-sm flex overflow-x-auto">
            {[
                { label: 'Hoy', value: 'today' },
                { label: '7 Días', value: 'week' },
                { label: 'Este Mes', value: 'month' },
                { label: 'Este Año', value: 'year' },
                { label: 'Todo', value: 'all' }
            ].map(f => (
                <button
                    key={f.value}
                    onClick={() => setTimeFilter(f.value)}
                    className={`px-4 py-2 text-sm font-bold rounded-md transition-all whitespace-nowrap
                        ${timeFilter === f.value 
                            ? 'bg-primary text-white shadow-sm' 
                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                        }`}
                >
                    {f.label}
                </button>
            ))}
        </div>
      </div>

      {/* KPI CARDS (5 COLUMNAS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        
        {/* CARD 1: VENTAS */}
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-2">
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Ventas ({timeFilter})</p>
                <div className="p-2 rounded-full bg-green-50 text-green-600"><DollarSign size={16} /></div>
            </div>
            <h3 className="text-2xl font-black text-gray-800 truncate">₲ {stats.totalSales.toLocaleString()}</h3>
        </div>

        {/* CARD 2: GANANCIA */}
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-2">
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Ganancia Neta</p>
                <div className="p-2 rounded-full bg-blue-50 text-blue-600"><TrendingUp size={16} /></div>
            </div>
            <h3 className="text-2xl font-black text-blue-600 truncate">₲ {stats.totalProfit.toLocaleString()}</h3>
        </div>

        {/* CARD 3: PEDIDOS */}
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-2">
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Pedidos</p>
                <div className="p-2 rounded-full bg-purple-50 text-purple-600"><ShoppingBag size={16} /></div>
            </div>
            <h3 className="text-2xl font-black text-gray-800">{stats.totalOrders}</h3>
        </div>

        {/* CARD 4: TICKET PROMEDIO */}
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-2">
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Ticket Prom.</p>
                <div className="p-2 rounded-full bg-orange-50 text-orange-600"><ArrowUpRight size={16} /></div>
            </div>
            <h3 className="text-2xl font-black text-gray-800 truncate">₲ {Math.round(stats.averageTicket).toLocaleString()}</h3>
        </div>

        {/* CARD 5: CLIENTES (NUEVO) */}
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-2">
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Clientes Reg.</p>
                <div className="p-2 rounded-full bg-cyan-50 text-cyan-600"><Users size={16} /></div>
            </div>
            <h3 className="text-2xl font-black text-gray-800">{allClientsCount}</h3>
        </div>
      </div>

      {/* SECCIÓN GRÁFICOS Y TOP */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          
          {/* GRÁFICO EVOLUTIVO */}
          <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-gray-800">Evolución de Ingresos</h3>
                  <div className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded font-bold flex items-center gap-1">
                      <Filter size={14}/> {timeFilter === 'month' ? 'Diario' : 'Temporal'}
                  </div>
              </div>
              <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0"/>
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill:'#9CA3AF', fontSize:12}} dy={10}/>
                        <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fill:'#9CA3AF', fontSize:12}} 
                            tickFormatter={(val) => {
                                if (val >= 1000000) return `₲${(val / 1000000).toLocaleString('es-PY', {maximumFractionDigits: 1})}M`;
                                if (val >= 1000) return `₲${(val / 1000).toFixed(0)}k`;
                                return `₲${val}`;
                            }}
                        />
                        <Tooltip 
                            contentStyle={{borderRadius:'10px', border:'none', boxShadow:'0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                            formatter={(value) => [`₲ ${value.toLocaleString()}`, "Ventas"]}
                        />
                        <Area type="monotone" dataKey="ventas" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorVentas)" />
                    </AreaChart>
                  </ResponsiveContainer>
              </div>
          </div>

          {/* TOP PRODUCTOS */}
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Package size={18} className="text-yellow-500"/> Top Productos
              </h3>
              <div className="space-y-4 flex-1 overflow-y-auto">
                  {topProducts.length === 0 ? (
                      <p className="text-gray-400 text-sm text-center py-10">Sin movimientos</p>
                  ) : topProducts.map((prod, idx) => (
                      <div key={idx} className="flex items-center gap-3 pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0
                              ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : 
                                idx === 1 ? 'bg-gray-100 text-gray-700' :
                                idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-blue-50 text-blue-600'}`}>
                              {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-700 truncate">{prod.name}</p>
                              <p className="text-xs text-gray-400">{prod.quantity} u. vendidas</p>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      </div>

      {/* SECCIÓN INFERIOR: VENTAS RECIENTES Y ALERTAS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* TABLA VENTAS RECIENTES */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                  <h3 className="font-bold text-gray-800">Últimos Movimientos</h3>
                  <button onClick={() => navigate('/pos/history')} className="text-xs font-bold text-primary hover:underline flex items-center gap-1">Ver todo <ChevronRight size={14}/></button>
              </div>
              <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                      <thead className="bg-white text-gray-500 font-bold border-b border-gray-100 text-xs uppercase">
                          <tr>
                              <th className="px-6 py-4">Ticket</th>
                              <th className="px-6 py-4">Fecha</th>
                              <th className="px-6 py-4">Cliente</th>
                              <th className="px-6 py-4 text-right">Total</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                          {recentSales.map(sale => (
                              <tr key={sale.id} className="hover:bg-blue-50/20 transition-colors">
                                  <td className="px-6 py-4 font-mono font-bold text-gray-600">#{sale.ticketId}</td>
                                  <td className="px-6 py-4 text-gray-500">
                                      {sale.dateObj.toLocaleDateString()} <span className="text-xs opacity-70">{sale.dateObj.toLocaleTimeString([],{hour:'2-digit', minute:'2-digit'})}</span>
                                  </td>
                                  <td className="px-6 py-4 font-medium text-gray-700">
                                      {sale.client?.name || 'Consumidor Final'}
                                  </td>
                                  <td className="px-6 py-4 text-right font-bold text-gray-800">
                                      ₲ {parseFloat(sale.total).toLocaleString()}
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>

          {/* ALERTAS DE STOCK (NUEVO) */}
          <div className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden flex flex-col">
              <div className="p-6 border-b border-red-50 bg-red-50/30 flex justify-between items-center">
                  <h3 className="font-bold text-red-700 flex items-center gap-2">
                      <AlertTriangle size={18}/> Stock Crítico
                  </h3>
                  <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-1 rounded-full">{lowStockItems.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {lowStockItems.length === 0 ? (
                      <div className="text-center py-10 text-gray-400">
                          {/* CORRECCIÓN: IMPORTAR CheckCircle ARRIBA */}
                          <CheckCircle size={30} className="mx-auto mb-2 text-green-400"/>
                          <p>Todo en orden</p>
                      </div>
                  ) : lowStockItems.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center p-3 rounded-lg bg-red-50 border border-red-100">
                          <div>
                              <p className="font-bold text-gray-800 text-sm truncate max-w-[150px]">{item.name}</p>
                              <p className="text-xs text-red-500">Mínimo: {item.min}</p>
                          </div>
                          <div className="text-right">
                              <span className="block text-xl font-black text-red-600">{item.stock}</span>
                              <span className="text-[10px] text-gray-500">u. disponibles</span>
                          </div>
                      </div>
                  ))}
              </div>
              {lowStockItems.length > 0 && (
                  <div className="p-4 border-t border-gray-100 bg-gray-50 text-center">
                      <button onClick={() => navigate('/productos')} className="text-xs font-bold text-red-600 hover:underline">Gestionar Inventario</button>
                  </div>
              )}
          </div>

      </div>

    </div>
  );
}