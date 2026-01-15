import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, addDoc, doc, getDoc, updateDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Save, ArrowLeft, Loader2, Plus, RotateCcw } from 'lucide-react';
import ProductPricing from '../../components/products/ProductPricing';
import ProductVariants from '../../components/products/ProductVariants';
import ProductHistory from '../../components/products/ProductHistory';

export default function NewProduct() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!!id);

  // ESTADO DE CATEGORÍAS
  const [categoriesList, setCategoriesList] = useState([]);
  const [isNewCategory, setIsNewCategory] = useState(false); // Alternar entre Select e Input

  // ESTADO INICIAL
  const [formData, setFormData] = useState({
    name: '',
    category: 'General',
    description: '',
    color: '#cbd5e1',
    is_available: true,
    sold_by: 'unit', // 'unit' o 'weight'
    price: 0,
    cost: 0,
    tax: 10,
    sku: '',
    barcode: '',
    is_composite: false,
    track_stock: true,
    current_stock: 0,
    low_stock: 5,
    variants: []
  });

  // 1. CARGAR CATEGORÍAS (CORREGIDO)
  const fetchCategories = async () => {
    try {
        const querySnapshot = await getDocs(collection(db, "categories"));
        const dbCats = querySnapshot.docs.map(doc => doc.data().name);
        
        // Categorías base que SIEMPRE deben estar disponibles
        const defaultCategories = ['General', 'Gaseosas', 'Bebidas', 'Cerveza', 'Lácteos', 'Limpieza', 'Almacén', 'Cigarrillos'];
        
        // Fusionamos las de la BD con las default y quitamos duplicados
        const mergedCategories = Array.from(new Set([...defaultCategories, ...dbCats])).sort();
        
        setCategoriesList(mergedCategories);
    } catch (error) {
        console.error("Error cargando categorías:", error);
        setCategoriesList(['General']);
    }
  };

  // 2. CARGAR PRODUCTO (Si es edición)
  const fetchProduct = useCallback(async () => {
    if (!id) return;
    try {
      const docRef = doc(db, "products", id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setFormData({ ...data, variants: data.variants || [] });
      } else {
        alert("Producto no encontrado");
        navigate('/productos');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setInitialLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchCategories();
    fetchProduct();
  }, [fetchProduct]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      
      // 1. SI ES UNA CATEGORÍA NUEVA, LA GUARDAMOS EN LA COLECCIÓN 'categories'
      if (isNewCategory && formData.category) {
        // Guardamos en mayúsculas el ID para evitar duplicados como "Bebidas" y "bebidas"
        const catId = formData.category.trim().toUpperCase();
        const catRef = doc(db, "categories", catId); 
        await setDoc(catRef, { name: formData.category });
      }

      // 2. GUARDAR EL PRODUCTO
      if (id) {
        await updateDoc(doc(db, "products", id), formData);
      } else {
        await addDoc(collection(db, "products"), formData);
      }
      navigate('/productos');
    } catch (error) {
      console.error("Error guardando:", error);
      alert("Error al guardar producto");
    } finally {
      setLoading(false);
    }
  };

  // --- FUNCIÓN PARA BLOQUEAR ENTER EN EL ESCÁNER ---
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Detiene el envío del formulario
    }
  };

  if (initialLoading) return <div className="p-8 text-center">Cargando producto...</div>;

  return (
    <div className="max-w-4xl mx-auto pb-24">
      <div className="flex items-center gap-4 mb-6">
        <button type="button" onClick={() => navigate('/productos')} className="p-2 hover:bg-gray-100 rounded-full">
          <ArrowLeft size={24} className="text-gray-600" />
        </button>
        <h1 className="text-2xl font-bold text-gray-800">{id ? 'Editar Producto' : 'Nuevo Producto'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* INFO BÁSICA */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Información General</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Nombre del Producto</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-primary" placeholder="Ej: Stella Artois" required />
                </div>

                {/* --- SELECTOR DE CATEGORÍA DINÁMICO --- */}
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Categoría</label>
                    <div className="flex gap-2">
                        {isNewCategory ? (
                            <input 
                                type="text" 
                                name="category" 
                                value={formData.category} 
                                onChange={handleChange}
                                placeholder="Escribe la nueva categoría..."
                                className="w-full px-4 py-2 border-2 border-primary/30 rounded-lg focus:outline-none focus:border-primary bg-blue-50/20"
                                autoFocus
                            />
                        ) : (
                            <select 
                                name="category" 
                                value={formData.category} 
                                onChange={handleChange} 
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-primary bg-white"
                            >
                                {categoriesList.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        )}
                        
                        <button 
                            type="button" 
                            onClick={() => {
                                setIsNewCategory(!isNewCategory);
                                // Si cambia a modo manual, limpia el campo. Si vuelve a lista, pone el primero o 'General'.
                                if(!isNewCategory) setFormData(prev => ({ ...prev, category: '' }));
                                else setFormData(prev => ({ ...prev, category: 'General' }));
                            }}
                            className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 border border-gray-200"
                            title={isNewCategory ? "Volver a lista" : "Crear nueva categoría"}
                        >
                            {isNewCategory ? <RotateCcw size={20}/> : <Plus size={20}/>}
                        </button>
                    </div>
                </div>

                {/* --- SELECTOR DE UNIDAD DE MEDIDA --- */}
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Se vende por</label>
                    <select 
                        name="sold_by" 
                        value={formData.sold_by} 
                        onChange={handleChange} 
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-primary bg-white"
                    >
                        <option value="unit">Unidad (u.)</option>
                        <option value="weight">Peso (KG)</option>
                    </select>
                </div>

                {/* --- CAMPO SKU CORREGIDO PARA ESCÁNER --- */}
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Código SKU / Barras</label>
                    <input 
                        type="text" 
                        name="sku" 
                        value={formData.sku} 
                        onChange={handleChange}
                        onKeyDown={handleKeyDown} // Evita submit al escanear
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-primary" 
                    />
                </div>
            </div>
        </div>

        <ProductPricing formData={formData} setFormData={setFormData} />

        {/* INVENTARIO SIMPLE (Si no hay variantes) */}
        {formData.variants.length === 0 && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Control de Stock</h3>
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Stock Actual</label>
                        <input 
                            type="number" 
                            step={formData.sold_by === 'weight' ? "0.001" : "1"} 
                            name="current_stock" 
                            value={formData.current_stock} 
                            onChange={handleChange} 
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-primary" 
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Stock Mínimo</label>
                        <input type="number" name="low_stock" value={formData.low_stock} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-primary" />
                    </div>
                </div>
            </div>
        )}

        <ProductVariants formData={formData} setFormData={setFormData} />

        {id && (
            <ProductHistory 
                productId={id} 
                onStockUpdate={fetchProduct} 
            />
        )}

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 flex justify-end gap-4 z-40 md:pl-64">
            <button type="button" onClick={() => navigate('/productos')} className="px-6 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
            <button type="submit" disabled={loading} className="px-8 py-2 bg-primary text-white font-bold rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2 shadow-lg shadow-green-200">
                {loading ? <Loader2 className="animate-spin" /> : <><Save size={20} /> GUARDAR PRODUCTO</>}
            </button>
        </div>

      </form>
    </div>
  );
}
