import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, where, getAggregateFromServer, count } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
    ShoppingBag, Users, TrendingUp,
    ArrowUpRight, Package, Calendar, Loader2, Filter, AlertTriangle, ChevronRight, CheckCircle,
    DollarSign, Barcode, TrendingDown, Receipt
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
                const salesRef = collection(db, 'sales');
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
            for (let i = 1; i <= daysInMonth; i++) {
                const label = i < 10 ? `0${i}` : `${i}`;
                tempChartData[label] = { label, value: 0, sortKey: i };
            }
        } else if (timeFilter === 'week' || timeFilter === 'today') {
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(now.getDate() - i);
                const label = d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' });
                tempChartData[label] = { label, value: 0, sortKey: d.getTime() };
            }
        } else if (timeFilter === 'year') {
            const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
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
                const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                key = months[sale.dateObj.getMonth()];
            } else {
                key = sale.dateObj.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' });
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
        <div className="flex h-screen items-center justify-center bg-slate-50">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="animate-spin text-emerald-600" size={48} />
                <p className="text-sm font-bold text-slate-500 tracking-wide animate-pulse">Cargando Panel Premium...</p>
            </div>
        </div>
    );

    // Calcular el valor máximo de cantidad vendida para usar como base del 100% de la barra de progreso
    const maxQtySold = topProducts.length > 0 ? Math.max(...topProducts.map(p => p.quantity)) : 1;

    return (
        <div className="max-w-7xl mx-auto pb-24 px-4 sm:px-6">

            {/* HEADER Y SALUDO */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border border-emerald-200">
                            v2.4 Bodega el Grifo
                        </span>
                    </div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight">Panel de Control</h1>
                    <p className="text-slate-500 text-sm font-medium">Estadísticas avanzadas, alertas de stock e ingresos del negocio</p>
                </div>

                {/* SELECTOR DE FILTRO DE TIEMPO PREMIUM */}
                <div className="bg-white p-1.5 rounded-xl border border-slate-200/80 shadow-sm flex gap-1 overflow-x-auto w-full lg:w-auto shrink-0 scrollbar-none">
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
                            className={`px-4 py-2 text-xs sm:text-sm font-black rounded-lg transition-all whitespace-nowrap active:scale-95 duration-150 flex-1 lg:flex-none
                        ${timeFilter === f.value
                                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200'
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                                }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI CARDS REDISEÑADAS A FORMATO PREMIUM LIGHT */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 mb-8">

                {/* CARD 1: VENTAS */}
                <div className="bg-gradient-to-br from-white to-emerald-50/10 p-5 rounded-2xl border border-slate-200/70 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group">
                    <div className="flex justify-between items-start mb-3">
                        <div>
                            <p className="text-slate-400 text-[9px] font-black uppercase tracking-wider mb-0.5">Ingresos Totales</p>
                            <h4 className="text-slate-800 font-extrabold text-xs">Ventas ({timeFilter})</h4>
                        </div>
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-base shadow-sm group-hover:scale-110 transition-transform duration-300">
                            ₲
                        </div>
                    </div>
                    <div className="mt-2">
                        <h3 className="text-2xl font-black text-slate-800 tracking-tight truncate leading-none mb-1">
                            ₲ {stats.totalSales.toLocaleString('es-PY')}
                        </h3>
                        <p className="text-[10px] text-emerald-600 font-bold">Monto bruto cobrado</p>
                    </div>
                </div>

                {/* CARD 2: GANANCIA */}
                <div className="bg-gradient-to-br from-white to-blue-50/10 p-5 rounded-2xl border border-slate-200/70 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group">
                    <div className="flex justify-between items-start mb-3">
                        <div>
                            <p className="text-slate-400 text-[9px] font-black uppercase tracking-wider mb-0.5">Utilidad Neta</p>
                            <h4 className="text-slate-800 font-extrabold text-xs">Ganancia Est.</h4>
                        </div>
                        <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-sm">
                            <TrendingUp size={16} />
                        </div>
                    </div>
                    <div className="mt-2">
                        <h3 className="text-2xl font-black text-blue-600 tracking-tight truncate leading-none mb-1">
                            ₲ {stats.totalProfit.toLocaleString('es-PY')}
                        </h3>
                        <p className="text-[10px] text-blue-500 font-bold">Precio − Costo Estimado</p>
                    </div>
                </div>

                {/* CARD 3: VENTAS CONCRETADAS (PEDIDOS RENOMBRADO) */}
                <div className="bg-gradient-to-br from-white to-violet-50/10 p-5 rounded-2xl border border-slate-200/70 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group">
                    <div className="flex justify-between items-start mb-3">
                        <div>
                            <p className="text-slate-400 text-[9px] font-black uppercase tracking-wider mb-0.5">Tickets de Caja</p>
                            <h4 className="text-slate-800 font-extrabold text-xs">Ventas Concretadas</h4>
                        </div>
                        <div className="w-9 h-9 rounded-xl bg-violet-50 border border-violet-100 text-violet-600 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-sm">
                            <Receipt size={16} />
                        </div>
                    </div>
                    <div className="mt-2">
                        <h3 className="text-2xl font-black text-slate-800 tracking-tight leading-none mb-1">
                            {stats.totalOrders}
                        </h3>
                        <p className="text-[10px] text-violet-600 font-bold">Cantidad de tickets emitidos</p>
                    </div>
                </div>

                {/* CARD 4: TICKET PROMEDIO */}
                <div className="bg-gradient-to-br from-white to-amber-50/10 p-5 rounded-2xl border border-slate-200/70 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group">
                    <div className="flex justify-between items-start mb-3">
                        <div>
                            <p className="text-slate-400 text-[9px] font-black uppercase tracking-wider mb-0.5">Promedio por Compra</p>
                            <h4 className="text-slate-800 font-extrabold text-xs">Ticket Promedio</h4>
                        </div>
                        <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-sm">
                            <ArrowUpRight size={16} />
                        </div>
                    </div>
                    <div className="mt-2">
                        <h3 className="text-2xl font-black text-slate-800 tracking-tight truncate leading-none mb-1">
                            ₲ {Math.round(stats.averageTicket).toLocaleString('es-PY')}
                        </h3>
                        <p className="text-[10px] text-amber-600 font-bold">Monto medio por ticket</p>
                    </div>
                </div>

                {/* CARD 5: CLIENTES */}
                <div className="bg-gradient-to-br from-white to-cyan-50/10 p-5 rounded-2xl border border-slate-200/70 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group">
                    <div className="flex justify-between items-start mb-3">
                        <div>
                            <p className="text-slate-400 text-[9px] font-black uppercase tracking-wider mb-0.5">Base de Datos</p>
                            <h4 className="text-slate-800 font-extrabold text-xs">Clientes Registrados</h4>
                        </div>
                        <div className="w-9 h-9 rounded-xl bg-cyan-50 border border-cyan-100 text-cyan-600 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-sm">
                            <Users size={16} />
                        </div>
                    </div>
                    <div className="mt-2">
                        <h3 className="text-2xl font-black text-slate-800 tracking-tight leading-none mb-1">
                            {allClientsCount}
                        </h3>
                        <p className="text-[10px] text-cyan-600 font-bold">Clientes guardados en total</p>
                    </div>
                </div>
            </div>

            {/* SECCIÓN DE GRÁFICOS Y RANKING DE PRODUCTOS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

                {/* GRÁFICO EVOLUTIVO PREMIUM */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="font-extrabold text-slate-800 text-base">Evolución de Ingresos</h3>
                            <p className="text-slate-400 text-xs mt-0.5">Curva de ingresos diarios según el periodo de tiempo</p>
                        </div>
                        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5">
                            <Filter size={13} /> {timeFilter === 'month' ? 'Diario' : 'Filtro Temporal'}
                        </div>
                    </div>
                    <div className="h-[300px] w-full flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
                                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} dy={10} />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }}
                                    tickFormatter={(val) => {
                                        if (val >= 1000000) return `₲${(val / 1000000).toLocaleString('es-PY', { maximumFractionDigits: 1 })}M`;
                                        if (val >= 1000) return `₲${(val / 1000).toFixed(0)}k`;
                                        return `₲${val}`;
                                    }}
                                />
                                <Tooltip
                                    contentStyle={{ borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)', fontFamily: 'sans-serif' }}
                                    formatter={(value) => [`₲ ${value.toLocaleString('es-PY')}`, "Total Facturado"]}
                                    labelFormatter={(label) => `Fecha: ${label}`}
                                />
                                <Area type="monotone" dataKey="ventas" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorVentas)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* RANKING DE VENTAS PREMIUM (TOP PRODUCTOS CON BARRAS DE PROGRESO) */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col justify-between">
                    <div>
                        <h3 className="font-extrabold text-slate-800 text-base mb-1 flex items-center gap-2">
                            <Package size={18} className="text-amber-500 animate-bounce" /> Ranking de Ventas
                        </h3>
                        <p className="text-slate-400 text-xs mb-5">Los 5 productos más vendidos del periodo</p>
                    </div>

                    <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                        {topProducts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full py-10 text-slate-400">
                                <Package size={32} className="opacity-20 mb-2" />
                                <p className="text-sm">Sin movimientos registrados aún</p>
                            </div>
                        ) : topProducts.map((prod, idx) => {
                            const percent = Math.min(100, Math.round((prod.quantity / maxQtySold) * 100));
                            return (
                                <div key={idx} className="pb-3.5 border-b border-slate-100 last:border-0 last:pb-0">
                                    <div className="flex items-center gap-3 mb-1.5">
                                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 select-none
                                    ${idx === 0 ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                                                idx === 1 ? 'bg-slate-100 text-slate-700 border border-slate-200' :
                                                    idx === 2 ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-slate-50 text-slate-500'}`}>
                                            {idx + 1 === 1 ? '🥇' : idx + 1 === 2 ? '🥈' : idx + 1 === 3 ? '🥉' : idx + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-black text-slate-700 truncate">{prod.name}</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className="text-xs font-black text-slate-800">{prod.quantity} u.</span>
                                        </div>
                                    </div>
                                    {/* BARRA DE PROGRESO PREMIUM */}
                                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden relative border border-slate-200/30">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${idx === 0 ? 'bg-amber-500' :
                                                idx === 1 ? 'bg-slate-500' :
                                                    idx === 2 ? 'bg-orange-500' : 'bg-emerald-500'
                                                }`}
                                            style={{ width: `${percent}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* SECCIÓN INFERIOR: TABLA DE ÚLTIMAS VENTAS Y ALERTAS DE STOCK */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* TABLA VENTAS RECIENTES REDISEÑADA */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col justify-between">
                    <div>
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="font-extrabold text-slate-800 text-base">Últimos Movimientos</h3>
                                <p className="text-slate-400 text-xs mt-0.5">Tickets de venta emitidos recientemente</p>
                            </div>
                            <button
                                onClick={() => navigate('/pos/history')}
                                className="text-xs font-black text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1 bg-white border border-slate-200 shadow-xs px-3 py-2 rounded-lg transition-all"
                            >
                                Ver Todo Historial <ChevronRight size={14} />
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm border-collapse">
                                <thead className="bg-slate-100/50 text-slate-500 font-extrabold border-b border-slate-200/50 text-[10px] uppercase tracking-wider select-none">
                                    <tr>
                                        <th className="px-6 py-4">Ticket</th>
                                        <th className="px-6 py-4">Fecha / Hora</th>
                                        <th className="px-6 py-4">Cliente</th>
                                        <th className="px-6 py-4">Estado</th>
                                        <th className="px-6 py-4 text-right">Monto Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs font-bold">
                                    {recentSales.length === 0 ? (
                                        <tr><td colSpan="5" className="px-6 py-10 text-center text-slate-400">Sin movimientos registrados</td></tr>
                                    ) : recentSales.map(sale => (
                                        <tr key={sale.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4 font-mono font-extrabold text-slate-600">#{sale.ticketId}</td>
                                            <td className="px-6 py-4 text-slate-500 whitespace-nowrap">
                                                {sale.dateObj.toLocaleDateString('es-PY')} <span className="text-slate-400 text-[10px] ml-1">{sale.dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-700 truncate max-w-[140px]">
                                                {sale.client?.name || 'Consumidor Final'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-emerald-200">
                                                    Completado
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right font-black text-slate-800 text-sm">
                                                ₲ {parseFloat(sale.total).toLocaleString('es-PY')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* SISTEMA DE ALERTAS DE STOCK CRÍTICO PREMIUM */}
                <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden flex flex-col justify-between">
                    <div>
                        <div className="p-5 border-b border-red-50 bg-red-50/20 flex justify-between items-center">
                            <div>
                                <h3 className="font-extrabold text-red-700 flex items-center gap-2 text-base">
                                    <AlertTriangle size={18} className="text-red-500 animate-pulse" /> Alerta de Stock Crítico
                                </h3>
                                <p className="text-red-500/80 text-[10px] font-bold mt-0.5">Artículos debajo del stock mínimo</p>
                            </div>
                            <span className="text-[11px] font-black bg-red-100 text-red-700 px-2.5 py-1 rounded-full border border-red-200 select-none">
                                {lowStockItems.length}
                            </span>
                        </div>
                        <div className="p-4 space-y-3">
                            {lowStockItems.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    <CheckCircle size={36} className="mx-auto mb-2.5 text-emerald-500 animate-bounce" />
                                    <p className="text-xs font-bold text-slate-500">¡Inventario Excelente!</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">No hay productos con bajo stock en este momento.</p>
                                </div>
                            ) : lowStockItems.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center p-3.5 rounded-xl bg-red-50/40 border border-red-100/50 hover:bg-red-50 transition-colors">
                                    <div className="min-w-0 flex-1 pr-2">
                                        <p className="font-black text-slate-700 text-xs truncate" title={item.name}>{item.name}</p>
                                        <p className="text-[10px] text-red-600 font-bold mt-0.5">Stock Mínimo Configurado: {item.min}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <span className="block text-2xl font-black text-red-600 tracking-tight leading-none mb-0.5 animate-pulse">
                                            {item.stock}
                                        </span>
                                        <span className="text-[9px] text-slate-400 font-bold uppercase">unid. disp</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    {lowStockItems.length > 0 && (
                        <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-center">
                            <button
                                onClick={() => navigate('/productos')}
                                className="text-xs font-black text-red-600 hover:text-red-700 hover:underline w-full py-1 transition-colors"
                            >
                                Reponer Mercadería en Inventario
                            </button>
                        </div>
                    )}
                </div>

            </div>

        </div>
    );
}