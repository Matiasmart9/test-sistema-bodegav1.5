import React from 'react';
import { FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function ReporteExcel({ products }) {
  
  // --- LÓGICA DE NIVEL DE STOCK ---
  const getStockLevel = (current, min) => {
      const stock = parseFloat(current || 0);
      const minimum = parseFloat(min || 0);

      if (stock <= 0) return 'SIN STOCK';
      if (stock <= minimum) return 'MENOR IGUAL MIN.';
      if (stock < (minimum * 2)) return 'MEDIO';
      return 'ALTO'; // Si es >= al doble del mínimo
  };

  const handleDownload = () => {
    const excelData = [];

    products.forEach(product => {
      // Opción A: El producto tiene variantes
      if (product.variants && product.variants.length > 0) {
        product.variants.forEach(variant => {
          excelData.push({
            'Nombre Producto': product.name,
            'Categoría': product.category,
            'Variante': variant.name,
            'SKU / REF': variant.sku,
            'Precio': variant.price,
            'Costo': variant.cost,
            'Stock Actual': variant.stock,
            'Stock Mínimo': variant.low_stock,
            'Nivel Stock': getStockLevel(variant.stock, variant.low_stock), // <--- COLUMNA NUEVA
            'Tipo': 'Variante'
          });
        });
      } 
      // Opción B: Producto simple sin variantes
      else {
        excelData.push({
          'Nombre Producto': product.name,
          'Categoría': product.category,
          'Variante': '-', 
          'SKU / REF': product.sku,
          'Precio': product.price,
          'Costo': product.cost,
          'Stock Actual': product.current_stock || 0,
          'Stock Mínimo': product.low_stock || 0,
          'Nivel Stock': getStockLevel(product.current_stock, product.low_stock), // <--- COLUMNA NUEVA
          'Tipo': 'Unidad'
        });
      }
    });

    // 2. Crear hoja de cálculo
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Ajustar ancho de columnas
    const columnWidths = [
      { wch: 25 }, // Nombre
      { wch: 15 }, // Categoria
      { wch: 20 }, // Variante
      { wch: 15 }, // SKU
      { wch: 10 }, // Precio
      { wch: 10 }, // Costo
      { wch: 12 }, // Stock Actual
      { wch: 12 }, // Stock Minimo
      { wch: 18 }, // Nivel Stock (Nuevo)
      { wch: 10 }  // Tipo
    ];
    worksheet['!cols'] = columnWidths;

    // 3. Crear libro y descargar
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario");
    
    const date = new Date().toLocaleDateString('es-PY').replace(/\//g, '-');
    XLSX.writeFile(workbook, `Inventario_Bodega_${date}.xlsx`);
  };

  return (
    <button 
      onClick={handleDownload}
      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors font-medium whitespace-nowrap"
      title="Descargar reporte con niveles de stock"
    >
      <FileSpreadsheet size={20} />
      <span>Excel</span>
    </button>
  );
}