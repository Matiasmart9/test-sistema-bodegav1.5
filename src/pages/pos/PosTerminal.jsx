import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { collection, getDocs, addDoc, query, where, updateDoc, doc, limit, getDoc, increment } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, LogOut, Clock, DollarSign, Barcode } from 'lucide-react';
import PaymentModal from './PaymentModal';

export default function PosTerminal() {
  const { userData, logout } = useAuth();
  
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['Todas']);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todas");
  
  const [currentShift, setCurrentShift] = useState(null);
  const [checkingShift, setCheckingShift] = useState(true);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [startingCash, setStartingCash] = useState('');
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // CARGAR PRODUCTOS Y CONCATENAR NOMBRES
  const fetchProducts = async () => {
    try {
      const prodSnap = await getDocs(collection(db, "products"));
      const prodsData = prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      let flatProducts = [];

      prodsData.forEach(p => {
          const soldBy = p.sold_by || 'unit'; 

          if (p.variants && p.variants.length > 0) {
              p.variants.forEach((v, index) => {
                  if (v.is_active) {
                      flatProducts.push({ 
                          ...v, 
                          id: `${p.id}-${index}`, 
                          originalId: p.id,    
                          variantIndex: index, 
                          category: p.category, 
                          name: `${p.name} / ${v.name}`, 
                          isVariant: true,
                          soldBy: soldBy
                      });
                  }
              });
          } else {
              flatProducts.push({
                  ...p,
                  originalId: p.id,
                  isVariant: false,
                  soldBy: soldBy,
                  stock: p.current_stock || 0
              });
          }
      });
      
      setProducts(flatProducts);
      setCategories(['Todas', ...new Set(prodsData.map(p => p.category).filter(Boolean))]);
    } catch (error) {
      console.error("Error cargando productos:", error);
    }
  };

  useEffect(() => {
    const init = async () => {
      await fetchProducts();
      if (userData?.id) {
        try {
            const q = query(collection(db, "shifts"), where("userId", "==", userData.id), where("status", "==", "open"), limit(1));
            const shiftSnap = await getDocs(q);
            if (!shiftSnap.empty) setCurrentShift({ id: shiftSnap.docs[0].id, ...shiftSnap.docs[0].data() });
        } catch (error) { console.error(error); }
      }
      setLoading(false);
      setCheckingShift(false);
    };
    init();
  }, [userData]);

  const handleOpenShift = async () => {
    if (!startingCash) return alert("Ingrese monto inicial");
    try {
        const newShift = { userId: userData.id, userName: userData.name, userRole: userData.role, openTime: new Date(), closeTime: null, startingCash: parseFloat(startingCash), status: "open", salesTotal: 0 };
        const docRef = await addDoc(collection(db, "shifts"), newShift);
        setCurrentShift({ id: docRef.id, ...newShift });
        setShowOpenModal(false);
    } catch (e) { alert("Error al abrir turno"); }
  };

  const handleCloseShiftAndLogout = async () => {
    if (!currentShift) return;
    try {
        await updateDoc(doc(db, "shifts", currentShift.id), { closeTime: new Date(), status: "closed" });
        logout(); 
    } catch (e) { alert("Error cerrando turno"); }
  };

  const handleProcessSale = async (paymentDetails) => {
    if (cart.length === 0) return null;
    
    try {
        const timestamp = Date.now().toString().slice(-6);
        const dateObj = new Date();
        const dateStr = dateObj.toISOString().slice(2,10).replace(/-/g,'');
        const ticketId = `T-${dateStr}-${timestamp}`;

        let totalProfit = 0;

        const itemsProcessed = cart.map(item => {
            const price = parseFloat(item.price || 0);
            const cost = parseFloat(item.cost || 0);
            const qty = parseFloat(item.quantity || 0);
            totalProfit += (price - cost) * qty;

            return {
                id: item.id,
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                cost: item.cost || 0,
                tax: item.tax || 10,
                soldBy: item.soldBy
            };
        });

        const saleData = {
            ticketId: ticketId,
            userId: userData.id,
            userName: userData.name,
            shiftId: currentShift?.id || 'unknown',
            date: dateObj, 
            total: totalAmount,
            paymentMethod: paymentDetails.method,
            amountReceived: parseFloat(paymentDetails.amountPaid || totalAmount),
            change: paymentDetails.change,
            // CAMBIO AQUÍ: Consistencia en el fallback
            client: paymentDetails.client || { name: 'SIN NOMBRE', ruc: 'SIN RUC' },
            items: itemsProcessed
        };

        await addDoc(collection(db, "sales"), saleData);

        if (currentShift?.id) {
            const shiftRef = doc(db, "shifts", currentShift.id);
            await updateDoc(shiftRef, {
                salesTotal: increment(totalAmount),
                profitTotal: increment(totalProfit)
            });
        }

        for (const item of cart) {
            const productRef = doc(db, "products", item.originalId);
            const productSnap = await getDoc(productRef);

            if (productSnap.exists()) {
                const productData = productSnap.data();
                if (item.isVariant) {
                    const updatedVariants = [...productData.variants];
                    if (updatedVariants[item.variantIndex]) {
                        const currentStock = parseFloat(updatedVariants[item.variantIndex].stock) || 0;
                        updatedVariants[item.variantIndex].stock = Math.max(0, currentStock - item.quantity);
                        await updateDoc(productRef, { variants: updatedVariants });
                    }
                } else {
                    const currentStock = parseFloat(productData.current_stock) || 0;
                    await updateDoc(productRef, { current_stock: Math.max(0, currentStock - item.quantity) });
                }
            }
        }

        return { 
            success: true, 
            ticketId, 
            date: dateObj,
            items: itemsProcessed,
            total: totalAmount,
            amountReceived: saleData.amountReceived,
            change: saleData.change,
            paymentMethod: saleData.paymentMethod,
            client: saleData.client,
            cashier: userData.name // Se pasa el nombre del cajero
        };

    } catch (error) {
        console.error("Error procesando venta:", error);
        return { success: false };
    }
  };

  const handleFinalizeSale = async () => {
    setCart([]);
    setShowPaymentModal(false);
    setLoading(true);
    await fetchProducts(); 
    setLoading(false);
  };

  const addToCart = (product) => {
    setCart(prev => {
        const existing = prev.find(item => item.id === product.id);
        const stockDisponible = parseFloat(product.stock || 0);

        if (existing) {
             const increment = 1; 
             if (existing.quantity + increment > stockDisponible) {
                 alert("⚠️ Stock insuficiente.");
                 return prev;
             }
             return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + increment } : item);
        }
        
        if (stockDisponible < 1) {
            alert("⚠️ Producto sin stock.");
            return prev;
        }

        return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (id) => setCart(prev => prev.filter(item => item.id !== id));

  const handleQuantityChange = (id, value) => {
    const item = cart.find(i => i.id === id);
    if(!item) return;
    let val = item.soldBy === 'weight' ? parseFloat(value) : parseInt(value);
    if (isNaN(val)) val = 0;
    if (val > item.stock) { alert(`⚠️ Solo hay ${item.stock} en stock.`); val = item.stock; }
    if (value === '') return; 
    setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: val } : i));
  };

  const updateQuantity = (id, delta) => {
    setCart(prev => prev.map(item => {
        if (item.id === id) {
             const newQty = Math.max(item.soldBy === 'weight' ? 0.001 : 1, item.quantity + delta);
             if (delta > 0 && newQty > item.stock) { alert("⚠️ Stock límite."); return item; }
             return { ...item, quantity: parseFloat(newQty.toFixed(3)) };
        }
        return item;
    }));
  };

  const handleScannerInput = (e) => {
    if (e.key === 'Enter') {
        const term = searchTerm.trim().toUpperCase();
        if (!term) return;

        const foundProduct = products.find(p => 
            (p.sku && p.sku.toUpperCase() === term) || 
            (p.barcode && p.barcode.toUpperCase() === term)
        );

        if (foundProduct) {
            addToCart(foundProduct);
            setSearchTerm(''); 
        }
    }
  };

  const totalAmount = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || (p.sku && p.sku.includes(searchTerm));
    const matchesCategory = selectedCategory === "Todas" || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading || checkingShift) return <div className="h-screen flex items-center justify-center">Cargando...</div>;

  if (!currentShift) return (
    <div className="h-screen bg-gray-900 flex flex-col items-center justify-center p-4 text-white relative">
        <button onClick={logout} className="absolute top-4 right-4 flex items-center gap-2 text-gray-400 hover:text-white"><LogOut size={20} /> Salir</button>
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl text-center max-w-md w-full border border-gray-700">
            <Clock size={40} className="text-gray-400 mx-auto mb-6" />
            <h2 className="text-2xl font-bold mb-2">El turno está cerrado</h2>
            <button onClick={() => setShowOpenModal(true)} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl mt-6 shadow-lg shadow-green-900/50">ABRIR EL TURNO</button>
        </div>
        {showOpenModal && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                <div className="bg-gray-800 w-full max-w-md rounded-2xl p-6 border border-gray-700">
                    <h3 className="text-xl font-bold mb-4">Monto inicial en caja</h3>
                    <div className="relative mb-6">
                        <DollarSign className="absolute left-3 top-3.5 text-green-500" size={20}/>
                        <input type="number" autoFocus value={startingCash} onChange={(e) => setStartingCash(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-lg py-3 pl-10 pr-4 text-white text-lg font-mono" placeholder="0"/>
                    </div>
                    <button onClick={handleOpenShift} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg">CONFIRMAR</button>
                    <button onClick={() => setShowOpenModal(false)} className="w-full mt-2 text-gray-400 py-2">Cancelar</button>
                </div>
            </div>
        )}
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden font-sans">
      
      {showPaymentModal && (
        <PaymentModal 
            total={totalAmount} 
            cart={cart}
            onClose={() => setShowPaymentModal(false)}
            onProcessPayment={handleProcessSale}
            onFinalize={handleFinalizeSale}
        />
      )}

      {showCloseConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center">
                <LogOut size={32} className="mx-auto mb-4 text-red-600" />
                <h3 className="text-xl font-bold text-gray-800 mb-2">¿Cerrar caja y salir?</h3>
                <div className="flex gap-3 mt-6">
                    <button onClick={() => setShowCloseConfirm(false)} className="flex-1 py-2 bg-gray-100 text-gray-700 font-bold rounded-lg">Cancelar</button>
                    <button onClick={handleCloseShiftAndLogout} className="flex-1 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700">Sí, Cerrar Caja</button>
                </div>
            </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white h-16 border-b border-gray-200 flex items-center justify-between px-4 shrink-0">
            <div className="relative w-96">
                <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
                <input 
                    type="text" 
                    placeholder="Buscar o escanear..." 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={handleScannerInput} 
                    autoFocus
                    className="w-full pl-10 pr-4 py-2 bg-gray-100 border-2 border-transparent focus:bg-white focus:border-primary rounded-lg outline-none transition-all" 
                />
            </div>
            <div className="flex items-center gap-4">
                <div className="text-right hidden md:block">
                    <p className="text-sm font-bold text-gray-800">{userData?.name}</p>
                    <p className="text-xs text-green-600 font-bold uppercase">TURNO ABIERTO</p>
                </div>
                <button onClick={() => setShowCloseConfirm(true)} className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium text-sm"><LogOut size={18} /> Cerrar Caja</button>
            </div>
        </div>
        <div className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-2 overflow-x-auto shrink-0 scrollbar-hide">
            {categories.map(cat => (
                <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${selectedCategory === cat ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{cat}</button>
            ))}
        </div>
        <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {filteredProducts.map((product, idx) => (
                    <div key={idx} onClick={() => addToCart(product)} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all flex flex-col justify-between h-40 relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: product.color || '#cbd5e1' }}></div>
                        <div className={`absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${product.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {product.soldBy === 'weight' ? parseFloat(product.stock).toFixed(2) + ' kg' : product.stock + ' u.'}
                        </div>
                        <div className="mt-2 pl-2">
                            <h3 className="font-bold text-gray-800 text-sm leading-tight line-clamp-2">{product.name}</h3>
                            {product.sku && <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1"><Barcode size={10}/> {product.sku}</p>}
                        </div>
                        <div className="pl-2 mt-auto"><span className="block text-primary font-black text-lg">₲ {product.price?.toLocaleString()}</span></div>
                    </div>
                ))}
            </div>
        </div>
      </div>

      <div className="w-96 bg-white border-l border-gray-200 flex flex-col shadow-xl z-10">
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-2 text-gray-700 font-bold"><ShoppingCart size={20} /><span>Ticket</span></div>
            <div className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-1 rounded">Items: {cart.length}</div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.map(item => (
                <div key={item.id} className="flex gap-3 bg-white p-2 rounded-lg border border-gray-100 hover:border-blue-100 transition-colors group">
                    <div className="flex flex-col items-center justify-between bg-gray-50 rounded w-14 py-1">
                        <button onClick={() => updateQuantity(item.id, 1)} className="text-gray-500 hover:text-green-600"><Plus size={14}/></button>
                        <input 
                            type="number" 
                            step={item.soldBy === 'weight' ? "0.001" : "1"}
                            value={item.quantity} 
                            onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                            className="w-full text-center bg-transparent font-bold text-sm focus:outline-none p-0 appearance-none"
                        />
                        <span className="text-[10px] text-gray-400">{item.soldBy === 'weight' ? 'kg' : 'un'}</span>
                        <button onClick={() => updateQuantity(item.id, -1)} className="text-gray-500 hover:text-red-500"><Minus size={14}/></button>
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-bold text-gray-800 line-clamp-2">{item.name}</p>
                        <p className="text-xs text-gray-400">Unit: ₲ {item.price.toLocaleString()}</p>
                    </div>
                    <div className="text-right flex flex-col justify-between items-end">
                        <p className="text-sm font-bold text-gray-800">₲ {(item.price * item.quantity).toLocaleString()}</p>
                        <button onClick={() => removeFromCart(item.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16} /></button>
                    </div>
                </div>
            ))}
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-200">
            <div className="flex justify-between text-gray-800 text-2xl font-bold mb-4"><span>Total</span><span>₲ {totalAmount.toLocaleString()}</span></div>
            <div className="grid grid-cols-4 gap-2">
                <button onClick={() => { if(window.confirm("¿Vaciar?")) setCart([]); }} disabled={cart.length === 0} className="col-span-1 flex items-center justify-center p-3 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"><Trash2 size={20} /></button>
                <button 
                    onClick={() => setShowPaymentModal(true)}
                    disabled={cart.length === 0} 
                    className="col-span-3 bg-primary hover:bg-green-600 text-white font-bold py-3 rounded-lg shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all"
                >
                    <CreditCard size={20} /> COBRAR
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}