import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, addDoc, doc, getDoc, updateDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { sileo } from 'sileo';
import { Save, ArrowLeft, Loader2, Plus, RotateCcw } from 'lucide-react';
import ProductPricing from '../../components/products/ProductPricing';
import ProductVariants from '../../components/products/ProductVariants';
import ProductHistory from '../../components/products/ProductHistory';
import ProductPriceHistory from '../../components/products/ProductPriceHistory';

export default function NewProduct() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userData } = useAuth();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!!id);

  // Guardar precios originales para comparar al guardar
  const originalPrices = useRef({ price: null, cost: null });

  // ESTADO DE CATEGORÍAS
  const [categoriesList, setCategoriesList] = useState([]);
  const [isNewCategory, setIsNewCategory] = useState(false);

  // ESTADO INICIAL
  const [formData, setFormData] = useState({
    name: '',
    category: '', 
    description: '',
    color: '#cbd5e1',
    is_available: true,
    sold_by: 'unit',
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

  // 1. CARGAR CATEGORÍAS (SIN SUGERENCIAS)
  const fetchCategories = async () => {
    try {
        const querySnapshot = await getDocs(collection(db, "categories"));
        const dbCats = querySnapshot.docs.map(doc => doc.data().name).sort();
        
        setCategoriesList(dbCats);

        // Lógica Inteligente: Si no hay categorías creadas, activar modo "Nueva" automáticamente
        if (dbCats.length === 0) {
            setIsNewCategory(true);
        }

    } catch (error) {
        console.error("Error cargando categorías:", error);
        setIsNewCategory(true); // En caso de error, permitir escribir
    }
  };

  // 2. CARGAR PRODUCTO (Edición)
  const fetchProduct = useCallback(async () => {
    if (!id) return;
    try {
      const docRef = doc(db, "products", id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setFormData({ ...data, variants: data.variants || [] });
        // Guardar precios originales para detectar cambios al guardar
        originalPrices.current = { price: data.price || 0, cost: data.cost || 0 };
        if (data.category) setIsNewCategory(false);
      } else {
        sileo.error({ title: 'Producto no encontrado.' });
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
    
    // VALIDACIÓN: Categoría obligatoria
    if (!formData.category || formData.category.trim() === '') {
      sileo.warning({ title: '⚠️ La categoría es obligatoria.', description: 'Seleccioná una o creá una nueva.' });
      return;
    }

    setLoading(true);
    try {
      // 1. SI ES NUEVA CATEGORÍA, GUARDARLA
      // Se guarda siempre que esté en modo 'isNewCategory' O que no exista en la lista actual
      if (isNewCategory && formData.category) {
        const catNameClean = formData.category.trim();
        // Usamos mayúsculas para el ID para evitar duplicados (ej: "Bebidas" == "BEBIDAS")
        const catId = catNameClean.toUpperCase(); 
        const catRef = doc(db, "categories", catId); 
        
        // Guardamos el nombre "bonito" que escribió el usuario
        await setDoc(catRef, { name: catNameClean }); 
        
        // Actualizamos la lista local para que aparezca la próxima vez sin recargar
        setCategoriesList(prev => [...prev, catNameClean].sort());
      }

      // 2. GUARDAR PRODUCTO
      if (id) {
        await updateDoc(doc(db, 'products', id), formData);

        // ── Registrar cambio de precio si hubo modificación ──────────
        const { price: oldPrice, cost: oldCost } = originalPrices.current;
        const newPrice = parseFloat(formData.price || 0);
        const newCost  = parseFloat(formData.cost  || 0);

        if (oldPrice !== null && (oldPrice !== newPrice || oldCost !== newCost)) {
          await addDoc(collection(db, 'price_logs'), {
            productId:  id,
            productName: formData.name,
            oldPrice,
            newPrice,
            oldCost,
            newCost,
            user:  userData?.name || 'Admin',
            date:  new Date(),
          });
        }

        sileo.success({ title: 'Producto actualizado correctamente.' });
      } else {
        const newDoc = await addDoc(collection(db, 'products'), formData);
        // Registrar precio inicial
        await addDoc(collection(db, 'price_logs'), {
          productId:   newDoc.id,
          productName: formData.name,
          oldPrice:    null,
          newPrice:    parseFloat(formData.price || 0),
          oldCost:     null,
          newCost:     parseFloat(formData.cost  || 0),
          user:  userData?.name || 'Admin',
          date:  new Date(),
        });
        sileo.success({ title: 'Producto creado correctamente.', description: 'Ya está disponible en el catálogo.' });
      }
      navigate('/productos');
    } catch (error) {
      console.error('Error guardando:', error);
      sileo.error({ title: 'Error al guardar el producto.', description: 'Verifique su conexión e intente nuevamente.' });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') e.preventDefault();
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
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Información General</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Nombre del Producto</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-primary" placeholder="Ej: Stella Artois" required />
                </div>

                {/* --- SELECCIÓN DE CATEGORÍA --- */}
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Categoría <span className="text-red-500">*</span></label>
                    <div className="flex gap-2">
                        {isNewCategory ? (
                            <input 
                                type="text" 
                                name="category" 
                                value={formData.category} 
                                onChange={handleChange}
                                placeholder="Escriba la nueva categoría..."
                                className="w-full px-4 py-2 border-2 border-primary/30 rounded-lg focus:outline-none focus:border-primary bg-blue-50/20"
                                autoFocus
                                required
                            />
                        ) : (
                            <select 
                                name="category" 
                                value={formData.category} 
                                onChange={handleChange} 
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-primary bg-white"
                                required
                            >
                                <option value="">-- Seleccione --</option>
                                {categoriesList.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        )}
                        
                        <button 
                            type="button" 
                            onClick={() => {
                                // Si cambia a modo manual, limpiamos para obligar a escribir
                                if(!isNewCategory) setFormData(prev => ({ ...prev, category: '' }));
                                setIsNewCategory(!isNewCategory);
                            }}
                            className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 border border-gray-200 transition-colors"
                            title={isNewCategory ? "Seleccionar de lista" : "Crear nueva categoría"}
                        >
                            {isNewCategory ? <RotateCcw size={20}/> : <Plus size={20}/>}
                        </button>
                    </div>
                    {/* Mensaje de ayuda */}
                    {categoriesList.length === 0 && isNewCategory && (
                        <p className="text-xs text-orange-500 mt-1">No hay categorías registradas. Cree la primera aquí.</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Se vende por</label>
                    <select name="sold_by" value={formData.sold_by} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-primary bg-white">
                        <option value="unit">Unidad (u.)</option>
                        <option value="weight">Peso (KG)</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Código SKU / Barras</label>
                    <input type="text" name="sku" value={formData.sku} onChange={handleChange} onKeyDown={handleKeyDown} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-primary" />
                </div>
            </div>
        </div>

        <ProductPricing formData={formData} setFormData={setFormData} />

        {formData.variants.length === 0 && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Control de Stock</h3>
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Stock Actual</label>
                        <input type="number" step={formData.sold_by === 'weight' ? "0.001" : "1"} name="current_stock" value={formData.current_stock} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-primary" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Stock Mínimo</label>
                        <input type="number" name="low_stock" value={formData.low_stock} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-primary" />
                    </div>
                </div>
            </div>
        )}

        <ProductVariants formData={formData} setFormData={setFormData} />

        {id && <ProductHistory productId={id} onStockUpdate={fetchProduct} />}

        {id && <ProductPriceHistory productId={id} />}

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