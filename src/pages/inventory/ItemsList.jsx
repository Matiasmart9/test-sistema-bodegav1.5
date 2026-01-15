import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, PackageOpen, Edit, Trash2, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from '../../firebase/config';
import ReporteExcel from '../../components/products/ReporteExcel';

export default function ItemsList() {
  const navigate = useNavigate();
  
  // --- ESTADOS DE DATOS ---
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- ESTADOS DE FILTROS ---
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");

  // --- PAGINACIÓN ---
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const [expandedRows, setExpandedRows] = useState(new Set());

  // 1. CARGA INICIAL
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Cargar Productos
        const prodSnap = await getDocs(collection(db, "products"));
        const productsData = prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setProducts(productsData);

        // Cargar Categorías (SOLO LAS CREADAS)
        const catSnap = await getDocs(collection(db, "categories"));
        // Usamos .name que es lo que se guarda en el producto
        const dbCategories = catSnap.docs.map(doc => doc.data().name).sort();
        
        setCategories(dbCategories);

      } catch (error) {
        console.error("Error al cargar:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleDelete = async (id, name) => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar "${name}"?`)) {
      try {
        await deleteDoc(doc(db, "products", id));
        setProducts(products.filter(product => product.id !== id));
      } catch (error) {
        console.error("Error al eliminar:", error);
      }
    }
  };

  const toggleRow = (id) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedRows(newExpanded);
  };

  // --- FILTRADO ---
  const getFilteredProducts = () => {
    return products.filter(product => {
      // 1. Filtro Texto
      const matchesSearch = 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (product.sku && product.sku.toLowerCase().includes(searchTerm.toLowerCase()));

      // 2. Filtro Categoría
      const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;

      // 3. Filtro Stock
      let matchesStock = true;
      if (stockFilter !== "all") {
        if (product.variants?.length > 0) {
           const someVariantLow = product.variants.some(v => (v.stock || 0) <= (v.low_stock || 5));
           const someVariantOut = product.variants.some(v => (v.stock || 0) <= 0);
           if (stockFilter === "low") matchesStock = someVariantLow;
           if (stockFilter === "out") matchesStock = someVariantOut;
        } else {
           let stock = product.current_stock || 0;
           let low = product.low_stock || 0;
           if (stockFilter === "low") matchesStock = stock <= low;
           if (stockFilter === "out") matchesStock = stock <= 0;
        }
      }
      return matchesSearch && matchesCategory && matchesStock;
    });
  };

  const filteredProducts = getFilteredProducts();

  // Paginación
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredProducts.slice(indexOfFirstItem, indexOfLastItem);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, stockFilter, itemsPerPage]);

  const goToPreviousPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));
  const goToNextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages));
  
  const calculateTotalStock = (product) => {
    if (product.variants && product.variants.length > 0) {
      const total = product.variants.reduce((acc, curr) => acc + (parseInt(curr.stock) || 0), 0);
      return <span className="text-blue-600 font-medium">{total} (Var)</span>;
    }
    const stock = parseInt(product.current_stock) || 0;
    const min = parseInt(product.low_stock) || 0;

    if (stock <= 0) return <span className="text-red-600 font-black bg-red-50 px-2 py-1 rounded">Sin Stock ({stock})</span>;
    else if (stock <= min) return <span className="text-red-500 font-bold">{stock}</span>;
    else return <span className="text-gray-800 font-medium">{stock}</span>;
  };

  return (
    <div className="max-w-7xl mx-auto pb-20">
      
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Inventario</h1>
        <p className="text-gray-500 text-sm mt-1">{filteredProducts.length} productos encontrados</p>
      </div>
        
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-6 bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto">
          
          {/* FILTRO CATEGORÍA */}
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-500 mb-1 ml-1">Categoría</label>
            <select 
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary bg-white min-w-[180px]"
            >
              <option value="all">Todas las categorías</option>
              {categories.map((cat, index) => (
                <option key={index} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-500 mb-1 ml-1">Alerta de inventario</label>
            <select 
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary bg-white min-w-[200px]"
            >
              <option value="all">Todos los artículos</option>
              <option value="low">Inventario bajo</option>
              <option value="out">No disponible en inventario</option>
            </select>
          </div>

          <div className="flex flex-col flex-1">
             <label className="text-xs font-semibold text-gray-500 mb-1 ml-1">Buscar</label>
             <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Buscar producto..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-primary text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-4 xl:mt-0 w-full xl:w-auto">
            <ReporteExcel products={filteredProducts} />
            <button 
                onClick={() => navigate('/productos/nuevo')}
                className="bg-primary hover:bg-green-500 text-white px-6 py-3 rounded-lg flex items-center gap-2 shadow-sm transition-colors justify-center font-medium"
            >
                <Plus size={20} /> Nuevo
            </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div></div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-16 px-4">
              <PackageOpen size={32} className="text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No se encontraron productos con estos filtros.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50/50 text-gray-500 text-xs uppercase font-bold tracking-wider">
                    <tr>
                      <th className="w-10 px-4 py-4"></th>
                      <th className="px-6 py-4">Producto</th>
                      <th className="px-6 py-4">Categoría</th>
                      <th className="px-6 py-4">Precio</th>
                      <th className="px-6 py-4">Coste</th> 
                      <th className="px-6 py-4">Stock</th>
                      <th className="px-6 py-4 text-center">Stock Min.</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {currentItems.map((product) => {
                      const hasVariants = product.variants && product.variants.length > 0;
                      const isExpanded = expandedRows.has(product.id);

                      return (
                        <React.Fragment key={product.id}>
                          <tr className={`hover:bg-gray-50 transition-colors group ${isExpanded ? 'bg-gray-50' : ''}`}>
                            <td className="px-4 py-4 text-center">
                              {hasVariants && (
                                <button 
                                  onClick={() => toggleRow(product.id)}
                                  className="p-1 text-gray-400 hover:text-gray-700 rounded transition-colors"
                                >
                                  {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                </button>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-sm"
                                    style={{ backgroundColor: product.color || '#cbd5e1' }}>
                                  {product.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-bold text-gray-800 text-sm">{product.name}</p>
                                  {product.sku && <p className="text-xs text-gray-400">{product.sku}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4"><span className="px-2 py-1 bg-gray-100 text-xs rounded-full font-medium text-gray-600">{product.category}</span></td>
                            <td className="px-6 py-4 font-medium text-sm text-gray-600">
                              {hasVariants ? <span className="italic">Varía</span> : `₲ ${product.price?.toLocaleString()}`}
                            </td>
                            <td className="px-6 py-4 font-medium text-sm text-gray-500">
                              {hasVariants ? '-' : `₲ ${(product.cost || 0).toLocaleString()}`}
                            </td>
                            <td className="px-6 py-4 text-sm">
                                {calculateTotalStock(product)}
                            </td>
                            <td className="px-6 py-4 text-center text-sm text-gray-500">
                                {hasVariants ? '-' : (product.low_stock || 0)}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => navigate(`/productos/editar/${product.id}`)}
                                  className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                                >
                                  <Edit size={18} />
                                </button>
                                <button 
                                  onClick={() => handleDelete(product.id, product.name)}
                                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {isExpanded && hasVariants && (
                          <tr className="bg-gray-50/50">
                              <td colSpan="8" className="px-4 py-4 md:px-10">
                              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm animate-fadeIn">
                                  <table className="w-full text-sm">
                                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-semibold border-b border-gray-100">
                                          <tr>
                                              <th className="px-6 py-3 text-left">Variante</th>
                                              <th className="px-6 py-3">Precio</th>
                                              <th className="px-6 py-3">Coste</th>
                                              <th className="px-6 py-3 w-32">Stock</th>
                                              <th className="px-6 py-3 w-32 text-orange-600">Inv. Bajo</th>
                                              <th className="px-6 py-3 w-40">SKU</th>
                                          </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                          {product.variants.map((variant, idx) => (
                                              <tr key={idx} className="hover:bg-gray-50">
                                                  <td className="px-6 py-3 font-medium text-gray-700">{variant.name}</td>
                                                  <td className="px-6 py-3">₲ {variant.price?.toLocaleString()}</td>
                                                  <td className="px-6 py-3 text-gray-500">₲ {variant.cost?.toLocaleString()}</td>
                                                  
                                                  <td className={`px-6 py-3 font-bold ${
                                                      (variant.stock <= 0) ? 'text-red-600 bg-red-50' : 
                                                      (variant.stock <= (variant.low_stock || 5)) ? 'text-red-500' : 'text-green-600'
                                                  }`}>
                                                      {variant.stock}
                                                  </td>
                                                  <td className="px-6 py-3 text-orange-600 font-medium">{variant.low_stock}</td>
                                                  <td className="px-6 py-3 text-xs text-gray-400">{variant.sku}</td>
                                              </tr>
                                          ))}
                                      </tbody>
                                  </table>
                              </div>
                              </td>
                          </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-gray-100 bg-gray-50/50 p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-2">
                  <button onClick={goToPreviousPage} disabled={currentPage === 1} className="w-8 h-8 flex items-center justify-center bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={16} /></button>
                  <button onClick={goToNextPage} disabled={currentPage === totalPages} className="w-8 h-8 flex items-center justify-center bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronRight size={16} /></button>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>Página:</span>
                  <div className="w-10 h-8 flex items-center justify-center bg-white border border-gray-200 rounded text-gray-800 font-medium">{currentPage}</div>
                  <span>de {totalPages}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>Filas por página:</span>
                  <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="h-8 border border-gray-200 rounded bg-white px-2 focus:outline-none focus:border-primary cursor-pointer">
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
