import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { FileBarChart, Calendar, Search, FileSpreadsheet, Loader2, Package, ChevronLeft, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';

// --- IMPORTACIONES PARA MÓVIL (CAPACITOR) ---
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export default function ProductSalesReport() {
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Fechas: Por defecto hoy
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  const fetchSalesData = async () => {
    setLoading(true);
    try {
        const start = new Date(dateRange.start);
        start.setHours(0, 0, 0, 0);
        const end = new Date(dateRange.end);
        end.setHours(23, 59, 59, 999);

        // 1. Traer ventas del rango de fecha
        const q = query(
            collection(db, "sales"), 
            where("date", ">=", start),
            where("date", "<=", end)
        );

        const snapshot = await getDocs(q);
        const rawSales = snapshot.docs.map(doc => doc.data());

        // 2. PROCESAMIENTO DE DATOS (Agrupación por Producto + Fecha)
        const productMap = {};

        rawSales.forEach(sale => {
            if (sale.status === 'canceled') return; // Ignorar anuladas

            // Convertir fecha de venta a string DD/MM/YYYY
            const saleDateObj = sale.date?.toDate ? sale.date.toDate() : new Date(sale.date);
            const dateStr = saleDateObj.toLocaleDateString('es-PY');

            sale.items.forEach(item => {
                // Clave compuesta: ID_Producto + Fecha (para separar por días)
                const key = `${item.id}-${dateStr}`; 
                
                if (!productMap[key]) {
                    productMap[key] = {
                        id: item.id,
                        name: item.name,
                        date: dateStr,
                        dateObj: saleDateObj, // Para ordenar
                        quantity: 0,
                        totalRevenue: 0,
                    };
                }

                productMap[key].quantity += parseFloat(item.quantity);
                productMap[key].totalRevenue += (parseFloat(item.quantity) * parseFloat(item.price));
            });
        });

        // Convertir a array y ordenar: Primero por Fecha (Desc), luego por Cantidad (Desc)
        const consolidatedData = Object.values(productMap).sort((a, b) => {
            if (b.dateObj - a.dateObj !== 0) return b.dateObj - a.dateObj;
            return b.quantity - a.quantity;
        });

        setSalesData(consolidatedData);
        setCurrentPage(1); // Resetear a página 1 al cargar nuevos datos

    } catch (error) {
        console.error("Error cargando reporte:", error);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalesData();
  }, [dateRange]);

  // --- FILTRADO LOCAL ---
  const filteredData = salesData.filter(item => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // --- PAGINACIÓN ---
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredData.slice(indexOfFirstItem, indexOfLastItem);

  const goToPreviousPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));
  const goToNextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages));

  // --- EXPORTAR A EXCEL (WEB Y MÓVIL) ---
  const handleExportExcel = async () => {
      // 1. Preparar los datos
      const dataToExport = filteredData.map(item => ({
          'Fecha': item.date,
          'Producto': item.name,
          'Cantidad Vendida': item.quantity,
          'Total Generado (₲)': item.totalRevenue,
      }));

      // 2. Crear el libro de Excel en memoria
      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Reporte Detallado");
      const fileName = `Ventas_Productos_${dateRange.start}.xlsx`;

      // 3. Detectar Plataforma y Guardar
      if (Capacitor.isNativePlatform()) {
          // --- LÓGICA PARA CELULAR (ANDROID/IOS) ---
          try {
              // Generar archivo en formato base64
              const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
              
              // Guardar en la carpeta caché del celular
              const saveResult = await Filesystem.writeFile({
                  path: fileName,
                  data: wbout,
                  directory: Directory.Cache 
              });

              // Abrir el menú de compartir nativo
              await Share.share({
                  title: 'Reporte de Ventas',
                  text: 'Adjunto el reporte de productos vendidos.',
                  url: saveResult.uri,
                  dialogTitle: 'Descargar Reporte Excel'
              });

          } catch (e) {
              console.error("Error exportando en App:", e);
              alert("Error al generar el archivo en el celular: " + e.message);
          }
      } else {
          // --- LÓGICA PARA WEB (COMPUTADORA) ---
          XLSX.writeFile(wb, fileName);
      }
  };

  // Totales generales (de lo filtrado)
  const totalItemsSold = filteredData.reduce((acc, curr) => acc + curr.quantity, 0);
  const totalRevenueGenerated = filteredData.reduce((acc, curr) => acc + curr.totalRevenue, 0);

  return (
    <div className="max-w-6xl mx-auto pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-6 gap-4">
        <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <FileBarChart className="text-purple-600"/> Reporte de Productos
            </h1>
            <p className="text-sm text-gray-500">Detalle de productos vendidos por fecha.</p>
        </div>

        {/* TARJETAS RESUMEN */}
        <div className="flex gap-4">
            <div className="bg-purple-50 border border-purple-100 p-3 rounded-xl shadow-sm">
                <p className="text-[10px] font-bold text-purple-400 uppercase">Unidades (Filtro)</p>
                <p className="text-xl font-black text-purple-700">{totalItemsSold.toLocaleString()}</p>
            </div>
            <div className="bg-green-50 border border-green-100 p-3 rounded-xl shadow-sm">
                <p className="text-[10px] font-bold text-green-400 uppercase">Ingresos (Filtro)</p>
                <p className="text-xl font-black text-green-700">₲ {totalRevenueGenerated.toLocaleString()}</p>
            </div>
        </div>
      </div>

      {/* BARRA DE HERRAMIENTAS */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-col lg:flex-row gap-4 justify-between items-center">
          
          {/* Fechas */}
          <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200 w-full lg:w-auto">
              <Calendar size={18} className="text-gray-400"/>
              <input type="date" value={dateRange.start} onChange={(e)=>setDateRange({...dateRange, start:e.target.value})} className="bg-transparent text-sm font-medium focus:outline-none text-gray-600"/>
              <span className="text-gray-400">-</span>
              <input type="date" value={dateRange.end} onChange={(e)=>setDateRange({...dateRange, end:e.target.value})} className="bg-transparent text-sm font-medium focus:outline-none text-gray-600"/>
          </div>

          {/* Buscador */}
          <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Filtrar por nombre de producto..." 
                value={searchTerm} 
                onChange={(e)=>{ setSearchTerm(e.target.value); setCurrentPage(1); }} 
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:outline-none focus:border-purple-400"
              />
          </div>

          {/* Excel */}
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 transition-colors shadow-sm whitespace-nowrap"
          >
              <FileSpreadsheet size={18}/> Exportar Excel
          </button>
      </div>

      {/* TABLA DE RESULTADOS */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          {loading ? (
              <div className="flex justify-center py-20"><Loader2 className="animate-spin text-purple-500" size={40}/></div>
          ) : filteredData.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                  <Package size={40} className="mx-auto mb-2 opacity-20"/>
                  <p>No hay ventas registradas con estos filtros.</p>
              </div>
          ) : (
              <>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4 w-32">Fecha</th>
                                <th className="px-6 py-4">Producto</th>
                                <th className="px-6 py-4 text-center">Cantidad</th>
                                <th className="px-6 py-4 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                            {currentItems.map((item, index) => (
                                <tr key={index} className="hover:bg-purple-50/30 transition-colors">
                                    <td className="px-6 py-4 text-gray-500 font-medium whitespace-nowrap">
                                        {item.date}
                                    </td>
                                    <td className="px-6 py-4 font-bold text-gray-800">
                                        {item.name}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="bg-purple-100 text-purple-700 py-1 px-3 rounded-full font-bold text-xs">
                                            {parseFloat(item.quantity).toLocaleString()}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-gray-700">
                                        ₲ {item.totalRevenue.toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* PAGINACIÓN */}
                <div className="border-t border-gray-100 bg-gray-50/50 p-4 flex justify-between items-center">
                    <span className="text-xs text-gray-500">
                        Mostrando {indexOfFirstItem + 1} - {Math.min(indexOfLastItem, filteredData.length)} de {filteredData.length} registros
                    </span>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={goToPreviousPage} 
                            disabled={currentPage === 1}
                            className="p-2 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 transition-colors"
                        >
                            <ChevronLeft size={16}/>
                        </button>
                        <span className="text-xs font-bold text-gray-700 px-2">
                            Página {currentPage} de {totalPages}
                        </span>
                        <button 
                            onClick={goToNextPage} 
                            disabled={currentPage === totalPages}
                            className="p-2 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 transition-colors"
                        >
                            <ChevronRight size={16}/>
                        </button>
                    </div>
                </div>
              </>
          )}
      </div>
    </div>
  );
}