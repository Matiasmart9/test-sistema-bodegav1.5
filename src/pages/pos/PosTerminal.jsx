import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { collection, getDocs, addDoc, query, where, updateDoc, doc, limit, getDoc, increment } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, LogOut, Clock, DollarSign, Barcode, TrendingDown, Printer, X, Tag, Store } from 'lucide-react';
import PaymentModal from './PaymentModal';
import ShiftCloseTicket from './ShiftCloseTicket'; 
import DiscountModal from './DiscountModal'; 

export default function PosTerminal() {
  const { userData, logout } = useAuth();
  
  // --- ESTADOS PRINCIPALES ---
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['Todas']);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todas");
  
  // --- ESTADOS DE CAJA Y MODALES ---
  const [currentShift, setCurrentShift] = useState(null);
  const [checkingShift, setCheckingShift] = useState(true);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [startingCash, setStartingCash] = useState('');
  
  // --- MODALES EXISTENTES ---
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false); 
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false); 
  
  // --- NUEVOS ESTADOS PARA DESCUENTOS ---
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [appliedDiscounts, setAppliedDiscounts] = useState([]); // Array de descuentos aplicados

  // Datos para el gasto y cierre
  const [expenseData, setExpenseData] = useState({ amount: '', reason: '' });
  const [shiftSummary, setShiftSummary] = useState({ sales: 0, expenses: 0 });

  // --- CARGA INICIAL ---
  const fetchProducts = async () => {
    try {
      const prodSnap = await getDocs(collection(db, "products"));
      const prodsData = prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      let flatProducts = [];
      prodsData.forEach(p => {
          const soldBy = p.sold_by || 'unit'; 
          // Aseguramos que low_stock tenga un valor por defecto si no existe
          const lowStock = p.low_stock ? parseFloat(p.low_stock) : 5; 

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
                          soldBy: soldBy,
                          low_stock: v.low_stock ? parseFloat(v.low_stock) : lowStock // Hereda o usa propio
                      });
                  }
              });
          } else {
              flatProducts.push({ 
                  ...p, 
                  originalId: p.id, 
                  isVariant: false, 
                  soldBy: soldBy, 
                  stock: p.current_stock || 0,
                  low_stock: lowStock
              });
          }
      });
      setProducts(flatProducts);
      setCategories(['Todas', ...new Set(prodsData.map(p => p.category).filter(Boolean))]);
    } catch (error) { console.error("Error productos:", error); }
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

  // --- FUNCIONES DE CAJA ---
  const handleOpenShift = async () => {
    if (!startingCash) return alert("Ingrese monto inicial");
    try {
        const newShift = { userId: userData.id, userName: userData.name, userRole: userData.role, openTime: new Date(), closeTime: null, startingCash: parseFloat(startingCash), status: "open", salesTotal: 0 };
        const docRef = await addDoc(collection(db, "shifts"), newShift);
        setCurrentShift({ id: docRef.id, ...newShift });
        setShowOpenModal(false);
    } catch (e) { alert("Error al abrir turno"); }
  };

  const handleAddExpense = async () => {
      if(!expenseData.amount || !expenseData.reason) return alert("Complete datos del gasto");
      try {
          await addDoc(collection(db, "shift_movements"), {
              shiftId: currentShift.id,
              type: 'expense',
              amount: parseFloat(expenseData.amount),
              reason: expenseData.reason,
              date: new Date(),
              user: userData.name
          });
          alert("Gasto registrado");
          setShowExpenseModal(false);
          setExpenseData({ amount: '', reason: '' });
      } catch (e) { console.error(e); alert("Error guardando gasto"); }
  };

  const prepareCloseShift = async () => {
      setLoading(true);
      try {
          const movQ = query(collection(db, "shift_movements"), where("shiftId", "==", currentShift.id));
          const movSnap = await getDocs(movQ);
          const totalExpenses = movSnap.docs.reduce((acc, doc) => acc + (doc.data().amount || 0), 0);

          const shiftRef = doc(db, "shifts", currentShift.id);
          const shiftSnap = await getDoc(shiftRef);
          const freshShiftData = shiftSnap.data();

          setShiftSummary({
              sales: freshShiftData.salesTotal || 0,
              expenses: totalExpenses
          });
          setShowCloseShiftModal(true); 

      } catch (e) { console.error(e); alert("Error calculando cierre"); }
      finally { setLoading(false); }
  };

  const confirmCloseShift = async () => {
      try {
          await updateDoc(doc(db, "shifts", currentShift.id), { 
              closeTime: new Date(), 
              status: "closed",
              finalExpenses: shiftSummary.expenses, 
              finalSales: shiftSummary.sales        
          });
          logout(); 
      } catch (e) { alert("Error cerrando turno"); }
  };

  // --- CÁLCULOS MATEMÁTICOS ---
  const subTotalAmount = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  
  const discountTotal = appliedDiscounts.reduce((acc, d) => {
      let val = 0;
      if (d.type === 'fixed') {
          val = d.value * d.quantity;
      } else {
          val = (subTotalAmount * (d.value / 100)) * d.quantity;
      }
      return acc + val;
  }, 0);

  const finalTotalAmount = Math.max(0, subTotalAmount - discountTotal);

  // --- PROCESAMIENTO DE VENTA ---
  const handleProcessSale = async (paymentDetails) => {
    if (cart.length === 0) return null;
    try {
        const timestamp = Date.now().toString().slice(-6);
        const dateObj = new Date();
        const dateStr = dateObj.toISOString().slice(2,10).replace(/-/g,'');
        const ticketId = `T-${dateStr}-${timestamp}`;
        
        let totalCost = 0; 

        const itemsProcessed = cart.map(item => {
            const price = parseFloat(item.price || 0);
            const cost = parseFloat(item.cost || 0);
            const qty = parseFloat(item.quantity || 0);
            totalCost += (cost * qty); 
            
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

        const saleProfit = finalTotalAmount - totalCost;

        const saleData = { 
            ticketId, 
            userId: userData.id, 
            userName: userData.name, 
            shiftId: currentShift?.id || 'unknown', 
            date: dateObj, 
            subTotal: subTotalAmount,
            discountTotal: discountTotal,
            appliedDiscounts: appliedDiscounts,
            total: finalTotalAmount, 
            paymentMethod: paymentDetails.method, 
            amountReceived: parseFloat(paymentDetails.amountPaid || finalTotalAmount), 
            change: paymentDetails.change, 
            client: paymentDetails.client || { name: 'SIN NOMBRE', ruc: 'SIN RUC' }, 
            items: itemsProcessed 
        };
        
        await addDoc(collection(db, "sales"), saleData);

        if (currentShift?.id) {
            const shiftRef = doc(db, "shifts", currentShift.id);
            await updateDoc(shiftRef, { 
                salesTotal: increment(finalTotalAmount), 
                profitTotal: increment(saleProfit)       
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
                        updatedVariants[item.variantIndex].stock = Math.max(0, parseFloat(updatedVariants[item.variantIndex].stock) - item.quantity);
                        await updateDoc(productRef, { variants: updatedVariants });
                    }
                } else {
                    await updateDoc(productRef, { current_stock: Math.max(0, parseFloat(productData.current_stock) - item.quantity) });
                }
            }
        }
        
        return { 
            success: true, 
            ticketId, 
            date: dateObj, 
            items: itemsProcessed, 
            subTotal: subTotalAmount,
            discountTotal: discountTotal,
            total: finalTotalAmount,
            appliedDiscounts: appliedDiscounts,
            amountReceived: saleData.amountReceived, 
            change: saleData.change, 
            paymentMethod: saleData.paymentMethod, 
            client: saleData.client, 
            cashier: userData.name 
        };

    } catch (error) { console.error(error); return { success: false }; }
  };

  const handleFinalizeSale = async () => { 
      setCart([]); 
      setAppliedDiscounts([]); 
      setShowPaymentModal(false); 
      setLoading(true); 
      await fetchProducts(); 
      setLoading(false); 
  };

  const addToCart = (product) => { setCart(prev => { const existing = prev.find(item => item.id === product.id); const stockDisponible = parseFloat(product.stock || 0); if (existing) { const increment = 1; if (existing.quantity + increment > stockDisponible) { alert("⚠️ Stock insuficiente."); return prev; } return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + increment } : item); } if (stockDisponible < 1) { alert("⚠️ Producto sin stock."); return prev; } return [...prev, { ...product, quantity: 1 }]; }); };
  const removeFromCart = (id) => setCart(prev => prev.filter(item => item.id !== id));
  const updateQuantity = (id, delta) => { setCart(prev => prev.map(item => { if (item.id === id) { const newQty = Math.max(item.soldBy === 'weight' ? 0.001 : 1, item.quantity + delta); if (delta > 0 && newQty > item.stock) { alert("⚠️ Stock límite."); return item; } return { ...item, quantity: parseFloat(newQty.toFixed(3)) }; } return item; })); };
  const handleQuantityChange = (id, value) => { const item = cart.find(i => i.id === id); if(!item) return; let val = item.soldBy === 'weight' ? parseFloat(value) : parseInt(value); if (isNaN(val)) val = 0; if (val > item.stock) { alert(`⚠️ Solo hay ${item.stock} en stock.`); val = item.stock; } if (value === '') return; setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: val } : i)); };
  const handleScannerInput = (e) => { if (e.key === 'Enter') { const term = searchTerm.trim().toUpperCase(); if (!term) return; const foundProduct = products.find(p => (p.sku && p.sku.toUpperCase() === term) || (p.barcode && p.barcode.toUpperCase() === term)); if (foundProduct) { addToCart(foundProduct); setSearchTerm(''); } } };
  
  const filteredProducts = products.filter(p => { const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || (p.sku && p.sku.includes(searchTerm)); const matchesCategory = selectedCategory === "Todas" || p.category === selectedCategory; return matchesSearch && matchesCategory; });

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

  // Lógica Permisos
  const canRegisterExpenses = userData?.role === 'admin' || userData?.canRegisterExpenses;

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden font-sans">
      
      {showPaymentModal && (
        <PaymentModal 
            total={finalTotalAmount} 
            cart={cart} 
            onClose={() => setShowPaymentModal(false)} 
            onProcessPayment={handleProcessSale} 
            onFinalize={handleFinalizeSale} 
        />
      )}

      {showDiscountModal && (
          <DiscountModal 
            onClose={() => setShowDiscountModal(false)}
            onApply={(discounts) => {
                setAppliedDiscounts(discounts);
                setShowDiscountModal(false);
            }}
          />
      )}

      {showExpenseModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><TrendingDown className="text-red-500"/> Registrar Gasto / Retiro</h3>
                      <button onClick={() => setShowExpenseModal(false)}><X size={20} className="text-gray-400"/></button>
                  </div>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Monto (Guaraníes)</label>
                          <input type="number" autoFocus className="w-full border p-2 rounded text-lg font-bold" placeholder="0" value={expenseData.amount} onChange={e=>setExpenseData({...expenseData, amount:e.target.value})}/>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Motivo / Descripción</label>
                          <input type="text" className="w-full border p-2 rounded" placeholder="Ej: Pago hielo, Almuerzo..." value={expenseData.reason} onChange={e=>setExpenseData({...expenseData, reason:e.target.value})}/>
                      </div>
                      <button onClick={handleAddExpense} className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-lg">GUARDAR GASTO</button>
                  </div>
              </div>
          </div>
      )}

      {showCloseShiftModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden">
                <div className="p-4 bg-gray-100 border-b flex justify-between items-center">
                    <h3 className="font-bold text-gray-800">Confirmar Cierre de Caja</h3>
                    <button onClick={() => setShowCloseShiftModal(false)}><X size={20}/></button>
                </div>
                <div className="flex-1 overflow-y-auto bg-gray-200 p-4 flex justify-center">
                    <div className="bg-white shadow-lg w-[300px]">
                        <ShiftCloseTicket 
                            shiftData={currentShift} 
                            salesTotal={shiftSummary.sales} 
                            expensesTotal={shiftSummary.expenses} 
                        />
                    </div>
                </div>
                <div id="printable-shift-close" className="hidden print:block">
                    <ShiftCloseTicket 
                        shiftData={currentShift} 
                        salesTotal={shiftSummary.sales} 
                        expensesTotal={shiftSummary.expenses} 
                    />
                </div>
                <div className="p-4 bg-white border-t space-y-2">
                    <button onClick={() => window.print()} className="w-full bg-gray-800 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-black"><Printer size={18}/> IMPRIMIR REPORTE</button>
                    <button onClick={confirmCloseShift} className="w-full bg-red-600 text-white font-bold py-3 rounded-lg hover:bg-red-700">CERRAR TURNO Y SALIR</button>
                </div>
            </div>
        </div>
      )}

      {/* INTERFAZ PRINCIPAL */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* HEADER */}
        <div className="bg-white h-20 border-b border-gray-200 flex items-center justify-between px-6 shrink-0 gap-6 shadow-sm z-20">
            <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2.5 rounded-xl text-green-700 shadow-sm border border-green-200">
                    <Store size={26} strokeWidth={2.5} />
                </div>
                <div>
                    <h1 className="text-xl font-black text-gray-800 tracking-tight leading-none">Bodega <span className="text-green-600">El Grifo</span></h1>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Terminal de Venta</p>
                </div>
            </div>

            <div className="relative flex-1 max-w-2xl">
                <Search className="absolute left-4 top-3.5 text-gray-400" size={20} />
                <input 
                    type="text" 
                    placeholder="Buscar producto por nombre, código o escanear..." 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                    onKeyDown={handleScannerInput} 
                    autoFocus
                    className="w-full pl-12 pr-4 py-3 bg-gray-100 border border-transparent focus:bg-white focus:border-green-500 focus:ring-4 focus:ring-green-500/10 rounded-xl outline-none transition-all text-sm font-medium shadow-inner" 
                />
            </div>

            <div className="flex items-center gap-3 border-l border-gray-200 pl-6">
                <div className="text-right hidden xl:block mr-2">
                    <p className="text-sm font-bold text-gray-800">{userData?.name}</p>
                    <p className="text-[10px] text-green-600 font-black uppercase bg-green-50 px-2 py-0.5 rounded-full border border-green-100 inline-block">Turno Abierto</p>
                </div>
                
                {canRegisterExpenses && (
                    <button onClick={() => setShowExpenseModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-white text-orange-600 rounded-xl hover:bg-orange-50 transition-all font-bold text-sm border border-orange-200 hover:border-orange-300 shadow-sm active:scale-95">
                        <TrendingDown size={18} /> <span className="hidden lg:inline">Gastos</span>
                    </button>
                )}
                
                <button onClick={prepareCloseShift} className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all font-bold text-sm border border-red-200 hover:border-red-300 shadow-sm active:scale-95">
                    <LogOut size={18} /> <span className="hidden lg:inline">Cerrar</span>
                </button>
            </div>
        </div>
        
        {/* BARRA CATEGORÍAS */}
        <div className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-2 overflow-x-auto shrink-0 scrollbar-hide shadow-sm z-10">
            {categories.map(cat => (
                <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all active:scale-95 ${selectedCategory === cat ? 'bg-gray-800 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'}`}>{cat}</button>
            ))}
        </div>

        {/* PRODUCTOS */}
        <div className="flex-1 p-6 overflow-y-auto bg-gray-50">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                {filteredProducts.map((product, idx) => {
                    // CÁLCULO DE ALERTA DE STOCK: ROJO SI ES <= STOCK MÍNIMO
                    const stockVal = parseFloat(product.stock);
                    const minVal = parseFloat(product.low_stock);
                    const isLowStock = stockVal <= minVal;

                    return (
                        <div key={idx} onClick={() => addToCart(product)} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200/60 cursor-pointer hover:shadow-lg hover:border-green-500/50 hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between h-44 relative overflow-hidden group">
                            
                            <div className="absolute top-0 left-0 w-1.5 h-full transition-colors group-hover:bg-green-500" style={{ backgroundColor: product.color || '#cbd5e1' }}></div>
                            
                            {/* BADGE DE STOCK (LÓGICA NUEVA) */}
                            <div className={`absolute top-3 right-3 text-[10px] font-black px-2 py-1 rounded-lg border 
                                ${isLowStock 
                                    ? 'bg-red-100 text-red-600 border-red-200'  // ROJO SI ES BAJO O CERO
                                    : 'bg-green-50 text-green-700 border-green-100' // VERDE SI ESTÁ BIEN
                                }`}>
                                {product.soldBy === 'weight' ? parseFloat(product.stock).toFixed(2) + ' kg' : product.stock + ' u.'}
                            </div>

                            <div className="mt-2 pl-3 pt-2">
                                <h3 className="font-bold text-gray-800 text-sm leading-tight line-clamp-2 mb-1 group-hover:text-green-700 transition-colors">{product.name}</h3>
                                {product.sku && <p className="text-[10px] text-gray-400 flex items-center gap-1 font-mono"><Barcode size={10}/> {product.sku}</p>}
                            </div>
                            
                            <div className="pl-3 mt-auto">
                                <span className="block text-green-600 font-black text-xl">₲ {product.price?.toLocaleString()}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
      </div>

      {/* CARRITO */}
      <div className="w-96 bg-white border-l border-gray-200 flex flex-col shadow-2xl z-30">
        
        <div className="h-20 flex items-center justify-between px-6 border-b border-gray-100 bg-white">
            <div className="flex items-center gap-3 text-gray-800 font-black text-xl">
                <ShoppingCart size={24} className="text-green-600" />
                <span>Ticket</span>
            </div>
            <div className="text-xs font-bold bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg border border-gray-200">
                {cart.length} Items
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
            {cart.map(item => (
                <div key={item.id} className="flex gap-3 bg-white p-3 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex flex-col items-center justify-between bg-gray-50 rounded-lg w-10 py-1 border border-gray-100">
                        <button onClick={() => updateQuantity(item.id, 1)} className="text-gray-400 hover:text-green-600 hover:bg-green-50 rounded p-0.5 transition-colors"><Plus size={14}/></button>
                        <input 
                            type="number" 
                            step={item.soldBy === 'weight' ? "0.001" : "1"}
                            value={item.quantity} 
                            onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                            className="w-full text-center bg-transparent font-bold text-sm focus:outline-none p-0 appearance-none text-gray-700"
                        />
                        <button onClick={() => updateQuantity(item.id, -1)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 rounded p-0.5 transition-colors"><Minus size={14}/></button>
                    </div>
                    <div className="flex-1 py-1">
                        <p className="text-sm font-bold text-gray-800 line-clamp-2 leading-tight">{item.name}</p>
                        <p className="text-[10px] text-gray-400 font-medium mt-1">Unit: ₲ {item.price.toLocaleString()}</p>
                    </div>
                    <div className="text-right flex flex-col justify-between items-end py-1">
                        <p className="text-sm font-black text-gray-800">₲ {(item.price * item.quantity).toLocaleString()}</p>
                        <button onClick={() => removeFromCart(item.id)} className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-red-50"><Trash2 size={16} /></button>
                    </div>
                </div>
            ))}
        </div>

        <div className="p-6 bg-white border-t border-gray-200 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
            
            <div className="mb-4">
                <button 
                    onClick={()=>setShowDiscountModal(true)} 
                    className={`w-full text-xs font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 border border-dashed
                        ${appliedDiscounts.length > 0 
                            ? 'bg-green-50 text-green-700 border-green-300' 
                            : 'bg-gray-50 text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300'}`}
                >
                    <Tag size={16}/> {appliedDiscounts.length > 0 ? 'Editar Promos' : 'Aplicar Desc/Promo'}
                </button>
                {appliedDiscounts.length > 0 && (
                    <div className="mt-2 space-y-1 bg-green-50 p-3 rounded-xl border border-green-100 text-[10px]">
                        {appliedDiscounts.map(d => (
                            <div key={d.id} className="flex justify-between font-bold text-green-700">
                                <span>{d.quantity}x {d.name}</span>
                                <span>- ₲ {(d.type==='fixed' ? d.value*d.quantity : (subTotalAmount*(d.value/100))*d.quantity).toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex justify-between text-gray-500 text-sm mb-1 font-medium">
                <span>Subtotal</span>
                <span>₲ {subTotalAmount.toLocaleString()}</span>
            </div>
            
            {discountTotal > 0 && (
                <div className="flex justify-between text-green-600 font-bold text-sm mb-3">
                    <span>Descuento</span>
                    <span>- ₲ {discountTotal.toLocaleString()}</span>
                </div>
            )}
            
            <div className="flex justify-between items-end text-gray-900 mb-6">
                <span className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Total a Pagar</span>
                <span className="text-3xl font-black">₲ {finalTotalAmount.toLocaleString()}</span>
            </div>

            <div className="grid grid-cols-4 gap-3">
                <button 
                    onClick={() => { if(window.confirm("¿Vaciar?")) { setCart([]); setAppliedDiscounts([]); } }} 
                    disabled={cart.length === 0} 
                    className="col-span-1 flex items-center justify-center p-3 rounded-xl border-2 border-gray-100 text-gray-400 hover:border-red-100 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 transition-all"
                >
                    <Trash2 size={22} />
                </button>
                <button 
                    onClick={() => setShowPaymentModal(true)} 
                    disabled={cart.length === 0} 
                    className="col-span-3 bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-green-200 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all text-lg"
                >
                    <CreditCard size={22} /> COBRAR
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}