import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  collection, getDocs, addDoc, query, where, updateDoc, doc,
  limit, getDoc, increment, orderBy, runTransaction, writeBatch
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, LogOut,
  Clock, DollarSign, Barcode, TrendingDown, Printer, X, Tag,
  Store, MoreVertical, Ban, RefreshCcw, AlertCircle, Loader2
} from 'lucide-react';
import PaymentModal from './PaymentModal';
import ShiftCloseTicket from './ShiftCloseTicket';
import DiscountModal from './DiscountModal';
import WeatherWidget from '../../components/ui/WeatherWidget';
import { toast } from '../../components/ui/Toast';

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: genera el próximo ID de ticket usando transacción atómica en Firestore
// ─────────────────────────────────────────────────────────────────────────────
async function generateTicketId(db) {
  const settingsRef = doc(db, 'settings', 'general');
  try {
    return await runTransaction(db, async (tx) => {
      const settingsDoc = await tx.get(settingsRef);

      if (!settingsDoc.exists() || !settingsDoc.data()?.ticketNumbering) {
        // Fallback: formato timestamp si no hay numeración configurada
        const ts = Date.now().toString().slice(-6);
        const ds = new Date().toISOString().slice(2, 10).replace(/-/g, '');
        return `T-${ds}-${ts}`;
      }

      const current   = settingsDoc.data().ticketNumbering.trim();
      const lastDash  = current.lastIndexOf('-');
      let newId;

      if (lastDash === -1) {
        const num = parseInt(current) || 0;
        newId = String(num + 1).padStart(current.length, '0');
      } else {
        const prefix = current.substring(0, lastDash + 1);
        const numStr = current.substring(lastDash + 1);
        const num    = parseInt(numStr) || 0;
        newId = prefix + String(num + 1).padStart(numStr.length, '0');
      }

      tx.update(settingsRef, { ticketNumbering: newId });
      return newId;
    });
  } catch (error) {
    console.error('Error generando ticketId:', error);
    // Fallback seguro
    const ts = Date.now().toString().slice(-6);
    const ds = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    return `T-${ds}-${ts}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
export default function PosTerminal() {
  const { userData, logout } = useAuth();

  // --- ESTADOS PRINCIPALES ---
  const [products,          setProducts]          = useState([]);
  const [categories,        setCategories]        = useState(['Todas']);
  const [loading,           setLoading]           = useState(true);
  const [cart,              setCart]              = useState([]);
  const [searchTerm,        setSearchTerm]        = useState('');
  const [selectedCategory,  setSelectedCategory]  = useState('Todas');

  // --- ESTADOS DE CAJA Y MODALES ---
  const [currentShift,      setCurrentShift]      = useState(null);
  const [checkingShift,     setCheckingShift]     = useState(true);
  const [showOpenModal,     setShowOpenModal]     = useState(false);
  const [startingCash,      setStartingCash]      = useState('');

  // --- MODALES ---
  const [showPaymentModal,  setShowPaymentModal]  = useState(false);
  const [showExpenseModal,  setShowExpenseModal]  = useState(false);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [appliedDiscounts,  setAppliedDiscounts]  = useState([]);
  const [showOptionsMenu,   setShowOptionsMenu]   = useState(false);
  const [showVoidModal,     setShowVoidModal]     = useState(false);
  const [recentSales,       setRecentSales]       = useState([]);
  const [voidSearch,        setVoidSearch]        = useState('');

  // Datos para el gasto y cierre
  const [expenseData,   setExpenseData]   = useState({ amount: '', reason: '' });
  const [shiftSummary,  setShiftSummary]  = useState({ sales: 0, expenses: 0 });

  // ─── Carga de productos ──────────────────────────────────────────────────
  const fetchProducts = async () => {
    try {
      const prodSnap = await getDocs(collection(db, 'products'));
      const prodsData = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const flat = [];

      prodsData.forEach(p => {
        const soldBy   = p.sold_by || 'unit';
        const lowStock = p.low_stock ? parseFloat(p.low_stock) : 5;

        if (p.variants && p.variants.length > 0) {
          p.variants.forEach((v, idx) => {
            if (v.is_active) {
              flat.push({
                ...v,
                id:           `${p.id}-${idx}`,
                originalId:   p.id,
                variantIndex: idx,
                category:     p.category,
                name:         `${p.name} / ${v.name}`,
                isVariant:    true,
                soldBy,
                low_stock:    v.low_stock ? parseFloat(v.low_stock) : lowStock,
              });
            }
          });
        } else {
          flat.push({
            ...p,
            originalId: p.id,
            isVariant:  false,
            soldBy,
            stock:      p.current_stock || 0,
            low_stock:  lowStock,
          });
        }
      });

      setProducts(flat);
      setCategories(['Todas', ...new Set(prodsData.map(p => p.category).filter(Boolean))]);
    } catch (error) {
      console.error('Error productos:', error);
    }
  };

  useEffect(() => {
    const init = async () => {
      await fetchProducts();
      if (userData?.id) {
        try {
          const q        = query(collection(db, 'shifts'), where('userId', '==', userData.id), where('status', '==', 'open'), limit(1));
          const shiftSnap = await getDocs(q);
          if (!shiftSnap.empty) setCurrentShift({ id: shiftSnap.docs[0].id, ...shiftSnap.docs[0].data() });
        } catch (error) { console.error(error); }
      }
      setLoading(false);
      setCheckingShift(false);
    };
    init();
  }, [userData]);

  // ─── Anulación de ventas ─────────────────────────────────────────────────
  const fetchRecentSales = async () => {
    if (!currentShift) return;
    try {
      const q    = query(collection(db, 'sales'), where('shiftId', '==', currentShift.id));
      const snap = await getDocs(q);
      const sales = snap.docs
        .map(d => {
          const data = d.data();
          return { id: d.id, ...data, dateObj: data.date?.toDate ? data.date.toDate() : new Date(data.date) };
        })
        .sort((a, b) => b.dateObj - a.dateObj)
        .filter(sale => sale.status !== 'canceled')
        .slice(0, 5);

      setRecentSales(sales);
      setShowVoidModal(true);
      setShowOptionsMenu(false);
    } catch (error) {
      console.error('Error fetching sales:', error);
      toast.error('Error al cargar ventas recientes: ' + error.message);
    }
  };

  const handleVoidSale = async (sale) => {
    if (!window.confirm(`¿Anular venta ${sale.ticketId} por ₲ ${sale.total.toLocaleString()}?\n\nEl stock será devuelto.`)) return;
    setLoading(true);
    try {
      // 1. Marcar venta como cancelada
      await updateDoc(doc(db, 'sales', sale.id), {
        status:     'canceled',
        canceledBy: userData.name,
        canceledAt: new Date(),
      });

      // 2. Descontar del total del turno
      await updateDoc(doc(db, 'shifts', currentShift.id), {
        salesTotal: increment(-sale.total),
      });

      // 3. Devolver stock (batch para atomicidad)
      const stockBatch = writeBatch(db);
      for (const item of sale.items) {
        const productInMemory = products.find(p => p.id === item.id);
        if (productInMemory) {
          const docRef  = doc(db, 'products', productInMemory.originalId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (productInMemory.isVariant) {
              const updatedVariants = [...data.variants];
              if (updatedVariants[productInMemory.variantIndex]) {
                updatedVariants[productInMemory.variantIndex].stock =
                  parseFloat(updatedVariants[productInMemory.variantIndex].stock) + parseFloat(item.quantity);
                stockBatch.update(docRef, { variants: updatedVariants });
              }
            } else {
              stockBatch.update(docRef, {
                current_stock: parseFloat(data.current_stock || 0) + parseFloat(item.quantity),
              });
            }
          }
        } else if (!item.id.includes('-')) {
          // Producto simple no en memoria
          stockBatch.update(doc(db, 'products', item.id), { current_stock: increment(item.quantity) });
        }
      }
      await stockBatch.commit();

      toast.success('Venta anulada. Stock devuelto correctamente.');
      setShowVoidModal(false);
      await fetchProducts();
    } catch (error) {
      console.error(error);
      toast.error('Error al anular la venta.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Apertura de turno ───────────────────────────────────────────────────
  const handleOpenShift = async () => {
    if (!startingCash) return toast.warning('Ingrese el monto inicial de caja.');
    try {
      const newShift = {
        userId:       userData.id,
        userName:     userData.name,
        userRole:     userData.role,
        openTime:     new Date(),
        closeTime:    null,
        startingCash: parseFloat(startingCash),
        status:       'open',
        salesTotal:   0,
      };
      const docRef = await addDoc(collection(db, 'shifts'), newShift);
      setCurrentShift({ id: docRef.id, ...newShift });
      setShowOpenModal(false);
    } catch (e) {
      toast.error('Error al abrir el turno.');
    }
  };

  // ─── Gastos ──────────────────────────────────────────────────────────────
  const handleAddExpense = async () => {
    if (!expenseData.amount || !expenseData.reason) {
      return toast.warning('Complete el monto y el motivo del gasto.');
    }
    try {
      await addDoc(collection(db, 'shift_movements'), {
        shiftId: currentShift.id,
        type:    'expense',
        amount:  parseFloat(expenseData.amount),
        reason:  expenseData.reason,
        date:    new Date(),
        user:    userData.name,
      });
      toast.success('Gasto registrado correctamente.');
      setShowExpenseModal(false);
      setExpenseData({ amount: '', reason: '' });
    } catch (e) {
      console.error(e);
      toast.error('Error al guardar el gasto.');
    }
  };

  // ─── Cierre de turno ─────────────────────────────────────────────────────
  const prepareCloseShift = async () => {
    setLoading(true);
    try {
      const movQ     = query(collection(db, 'shift_movements'), where('shiftId', '==', currentShift.id));
      const movSnap  = await getDocs(movQ);
      const totalExp = movSnap.docs.reduce((acc, d) => acc + (d.data().amount || 0), 0);

      const shiftSnap = await getDoc(doc(db, 'shifts', currentShift.id));
      const freshData = shiftSnap.data();

      setShiftSummary({ sales: freshData.salesTotal || 0, expenses: totalExp });
      setShowCloseShiftModal(true);
    } catch (e) {
      console.error(e);
      toast.error('Error al calcular el cierre de caja.');
    } finally {
      setLoading(false);
    }
  };

  const confirmCloseShift = async () => {
    try {
      await updateDoc(doc(db, 'shifts', currentShift.id), {
        closeTime:    new Date(),
        status:       'closed',
        finalExpenses: shiftSummary.expenses,
        finalSales:   shiftSummary.sales,
      });
      logout();
    } catch (e) {
      toast.error('Error al cerrar el turno.');
    }
  };

  // ─── Cálculos del carrito ────────────────────────────────────────────────
  const subTotalAmount = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  const discountTotal = appliedDiscounts.reduce((acc, d) => {
    const val = d.type === 'fixed'
      ? d.value * d.quantity
      : (subTotalAmount * (d.value / 100)) * d.quantity;
    return acc + val;
  }, 0);

  const finalTotalAmount = Math.max(0, subTotalAmount - discountTotal);

  // ─── Procesamiento de venta ──────────────────────────────────────────────
  const handleProcessSale = async (paymentDetails) => {
    if (cart.length === 0) return null;
    try {
      const dateObj  = new Date();
      // Número de ticket desde Firestore (atómico)
      const ticketId = await generateTicketId(db);

      let totalCost = 0;
      const itemsProcessed = cart.map(item => {
        const cost = parseFloat(item.cost || 0);
        const qty  = parseFloat(item.quantity || 0);
        totalCost += cost * qty;
        return {
          id:      item.id,
          name:    item.name,
          quantity: item.quantity,
          price:   item.price,
          cost:    item.cost || 0,
          tax:     item.tax || 10,
          soldBy:  item.soldBy,
        };
      });

      const saleProfit = finalTotalAmount - totalCost;
      const saleData = {
        ticketId,
        userId:           userData.id,
        userName:         userData.name,
        shiftId:          currentShift?.id || 'unknown',
        date:             dateObj,
        subTotal:         subTotalAmount,
        discountTotal,
        appliedDiscounts,
        total:            finalTotalAmount,
        paymentMethod:    paymentDetails.method,
        amountReceived:   parseFloat(paymentDetails.amountPaid || finalTotalAmount),
        change:           paymentDetails.change,
        client:           paymentDetails.client || { name: 'SIN NOMBRE', ruc: 'SIN RUC' },
        items:            itemsProcessed,
        status:           'completed',
      };

      // ── Guardar venta ──────────────────────────────────────────────────
      await addDoc(collection(db, 'sales'), saleData);

      // ── Actualizar totales del turno ───────────────────────────────────
      if (currentShift?.id) {
        await updateDoc(doc(db, 'shifts', currentShift.id), {
          salesTotal:  increment(finalTotalAmount),
          profitTotal: increment(saleProfit),
        });
      }

      // ── Actualizar stock (lecturas en paralelo + batch de escritura) ───
      const uniqueOriginalIds = [...new Set(cart.map(item => item.originalId))];
      const productSnaps = await Promise.all(
        uniqueOriginalIds.map(id => getDoc(doc(db, 'products', id)))
      );
      const productDataMap = {};
      productSnaps.forEach(snap => {
        if (snap.exists()) productDataMap[snap.id] = snap.data();
      });

      const stockBatch = writeBatch(db);
      for (const item of cart) {
        const productData = productDataMap[item.originalId];
        if (!productData) continue;
        const productRef = doc(db, 'products', item.originalId);

        if (item.isVariant) {
          const updatedVariants = [...productData.variants];
          if (updatedVariants[item.variantIndex]) {
            updatedVariants[item.variantIndex].stock = Math.max(
              0,
              parseFloat(updatedVariants[item.variantIndex].stock || 0) - item.quantity
            );
            stockBatch.update(productRef, { variants: updatedVariants });
          }
        } else {
          stockBatch.update(productRef, {
            current_stock: Math.max(0, parseFloat(productData.current_stock || 0) - item.quantity),
          });
        }
      }
      await stockBatch.commit();

      return {
        success:          true,
        ticketId,
        date:             dateObj,
        items:            itemsProcessed,
        subTotal:         subTotalAmount,
        discountTotal,
        total:            finalTotalAmount,
        appliedDiscounts,
        amountReceived:   saleData.amountReceived,
        change:           saleData.change,
        paymentMethod:    saleData.paymentMethod,
        client:           saleData.client,
        cashier:          userData.name,
      };
    } catch (error) {
      console.error(error);
      return { success: false };
    }
  };

  const handleFinalizeSale = async () => {
    setCart([]);
    setAppliedDiscounts([]);
    setShowPaymentModal(false);
    setLoading(true);
    await fetchProducts();
    setLoading(false);
  };

  // ─── Operaciones del carrito ─────────────────────────────────────────────
  const addToCart = (product) => {
    setCart(prev => {
      const existing        = prev.find(item => item.id === product.id);
      const stockDisponible = parseFloat(product.stock || 0);

      if (existing) {
        if (existing.quantity + 1 > stockDisponible) {
          toast.warning('⚠️ Stock insuficiente para agregar más unidades.');
          return prev;
        }
        return prev.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      if (stockDisponible < 1) {
        toast.warning('⚠️ Este producto no tiene stock disponible.');
        return prev;
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart  = (id) => setCart(prev => prev.filter(item => item.id !== id));

  const updateQuantity = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id !== id) return item;
      const minQty = item.soldBy === 'weight' ? 0.001 : 1;
      const newQty = Math.max(minQty, item.quantity + delta);
      if (delta > 0 && newQty > item.stock) {
        toast.warning('⚠️ Límite de stock alcanzado.');
        return item;
      }
      return { ...item, quantity: parseFloat(newQty.toFixed(3)) };
    }));
  };

  const handleQuantityChange = (id, value) => {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    let val = item.soldBy === 'weight' ? parseFloat(value) : parseInt(value);
    if (isNaN(val)) val = 0;
    if (val > item.stock) {
      toast.warning(`⚠️ Solo hay ${item.stock} en stock.`);
      val = item.stock;
    }
    if (value === '') return;
    setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: val } : i));
  };

  const handleScannerInput = (e) => {
    if (e.key === 'Enter') {
      const term = searchTerm.trim().toUpperCase();
      if (!term) return;
      const found = products.find(p =>
        (p.sku && p.sku.toUpperCase() === term) ||
        (p.barcode && p.barcode.toUpperCase() === term)
      );
      if (found) { addToCart(found); setSearchTerm(''); }
    }
  };

  const filteredProducts = products.filter(p => {
    const matchSearch   = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (p.sku && p.sku.includes(searchTerm));
    const matchCategory = selectedCategory === 'Todas' || p.category === selectedCategory;
    return matchSearch && matchCategory;
  });

  if (loading || checkingShift) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-100">
        <Loader2 className="animate-spin text-primary" size={40}/>
      </div>
    );
  }

  // ── Pantalla de apertura de turno ─────────────────────────────────────────
  if (!currentShift) {
    return (
      <div className="h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white relative">
        <button
          onClick={logout}
          className="absolute top-4 right-4 flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <LogOut size={20}/> Salir
        </button>

        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl text-center max-w-md w-full border border-slate-700">
          <Clock size={48} className="text-emerald-400 mx-auto mb-6"/>
          <h2 className="text-2xl font-bold mb-2">El turno está cerrado</h2>
          <p className="text-slate-400 mb-6">Debe abrir caja para comenzar a vender.</p>
          <button
            onClick={() => setShowOpenModal(true)}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl mt-2 shadow-lg shadow-emerald-900/50 transition-all hover:scale-[1.02]"
          >
            ABRIR EL TURNO
          </button>
        </div>

        {showOpenModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-slate-800 w-full max-w-md rounded-2xl p-6 border border-slate-700 shadow-2xl">
              <h3 className="text-xl font-bold mb-4 text-white">Monto inicial en caja</h3>
              <div className="relative mb-6">
                <DollarSign className="absolute left-3 top-3.5 text-emerald-500" size={20}/>
                <input
                  type="number"
                  autoFocus
                  value={startingCash}
                  onChange={e => setStartingCash(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleOpenShift()}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg py-3 pl-10 pr-4
                             text-white text-lg font-mono focus:border-emerald-500 focus:outline-none
                             focus:ring-1 focus:ring-emerald-500"
                  placeholder="0"
                />
              </div>
              <button
                onClick={handleOpenShift}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg transition-colors"
              >
                CONFIRMAR
              </button>
              <button
                onClick={() => setShowOpenModal(false)}
                className="w-full mt-3 text-slate-400 py-2 hover:text-white transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const canRegisterExpenses = userData?.role === 'admin' || userData?.canRegisterExpenses;

  // ── INTERFAZ PRINCIPAL ────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans">

      {/* ── MODALES ──────────────────────────────────────────────────────── */}

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
          onApply={discounts => { setAppliedDiscounts(discounts); setShowDiscountModal(false); }}
        />
      )}

      {/* Modal gastos */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-fadeIn">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <TrendingDown className="text-rose-500"/> Registrar Gasto
              </h3>
              <button onClick={() => setShowExpenseModal(false)} className="p-1 hover:bg-gray-100 rounded-full">
                <X size={20} className="text-gray-400"/>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Monto (Guaraníes)</label>
                <input
                  type="number"
                  autoFocus
                  className="w-full border border-gray-200 p-3 rounded-xl text-lg font-bold
                             focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
                  placeholder="0"
                  value={expenseData.amount}
                  onChange={e => setExpenseData({ ...expenseData, amount: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Motivo / Descripción</label>
                <input
                  type="text"
                  className="w-full border border-gray-200 p-3 rounded-xl focus:outline-none
                             focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
                  placeholder="Ej: Pago hielo, Almuerzo..."
                  value={expenseData.reason}
                  onChange={e => setExpenseData({ ...expenseData, reason: e.target.value })}
                />
              </div>
              <button
                onClick={handleAddExpense}
                className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-3.5 rounded-xl
                           shadow-lg shadow-rose-200 transition-all hover:scale-[1.02]"
              >
                GUARDAR GASTO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal anular venta */}
      {showVoidModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-0 overflow-hidden flex flex-col max-h-[80vh] animate-fadeIn">
            <div className="p-4 bg-rose-50 border-b border-rose-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-rose-700 flex items-center gap-2">
                <Ban size={20}/> Anular Venta
              </h3>
              <button onClick={() => setShowVoidModal(false)} className="p-1 hover:bg-rose-100 rounded-full">
                <X size={20} className="text-rose-400"/>
              </button>
            </div>
            <div className="p-4 border-b border-gray-100 bg-white">
              <div className="relative">
                <Search className="absolute left-3 top-3 text-gray-400" size={16}/>
                <input
                  type="text"
                  placeholder="Buscar por Nro Ticket..."
                  value={voidSearch}
                  onChange={e => setVoidSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm
                             bg-gray-50 focus:bg-white focus:outline-none focus:border-rose-300 transition-all"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {recentSales.filter(s => s.ticketId.toLowerCase().includes(voidSearch.toLowerCase())).length === 0 ? (
                <div className="text-center text-gray-400 py-8 text-sm flex flex-col items-center">
                  <Ban size={32} className="mb-2 opacity-20"/>
                  No se encontraron ventas recientes.
                </div>
              ) : (
                recentSales
                  .filter(s => s.ticketId.toLowerCase().includes(voidSearch.toLowerCase()))
                  .map(sale => (
                    <div key={sale.id} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center hover:shadow-md transition-shadow">
                      <div>
                        <p className="font-bold text-gray-800 text-sm">{sale.ticketId}</p>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock size={10}/>
                          {new Date(sale.date?.toDate ? sale.date.toDate() : sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {' • '}{sale.items.length} items
                        </p>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <span className="font-bold text-gray-800">₲ {sale.total.toLocaleString()}</span>
                        <button
                          onClick={() => handleVoidSale(sale)}
                          className="bg-rose-50 text-rose-600 p-2 rounded-lg hover:bg-rose-100 hover:text-rose-700 transition-colors border border-rose-100"
                          title="Anular y Devolver Stock"
                        >
                          <RefreshCcw size={18}/>
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
            <div className="p-3 bg-rose-50/50 text-[10px] text-rose-400 text-center font-medium border-t border-rose-100">
              Solo se muestran ventas del turno actual.
            </div>
          </div>
        </div>
      )}

      {/* Modal cierre de turno */}
      {showCloseShiftModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden animate-fadeIn">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
              <h3 className="font-bold text-gray-800">Confirmar Cierre de Caja</h3>
              <button onClick={() => setShowCloseShiftModal(false)} className="p-1 hover:bg-gray-200 rounded-full">
                <X size={20}/>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-gray-100 p-6 flex justify-center">
              <div className="bg-white shadow-xl w-full max-w-[320px]">
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
            <div className="p-4 bg-white border-t border-gray-200 space-y-3">
              <button
                onClick={() => window.print()}
                className="w-full bg-gray-800 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-lg"
              >
                <Printer size={18}/> IMPRIMIR REPORTE
              </button>
              <button
                onClick={confirmCloseShift}
                className="w-full bg-rose-600 text-white font-bold py-3.5 rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200"
              >
                CERRAR TURNO Y SALIR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ÁREA IZQUIERDA: PRODUCTOS ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* HEADER */}
        <div className="bg-white h-20 shadow-sm flex items-center justify-between px-6 shrink-0 gap-6 z-20 sticky top-0">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-2.5 rounded-xl text-white shadow-lg shadow-green-200">
              <Store size={24} strokeWidth={2.5}/>
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-800 tracking-tight leading-none">
                Bodega <span className="text-emerald-600">El Grifo</span>
              </h1>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                Terminal de Venta
              </p>
            </div>
          </div>

          {/* BUSCADOR */}
          <div className="relative flex-1 max-w-2xl group">
            <Search className="absolute left-4 top-3.5 text-gray-400 group-focus-within:text-emerald-500 transition-colors" size={20}/>
            <input
              type="text"
              placeholder="Buscar producto por nombre, código o escanear..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={handleScannerInput}
              autoFocus
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 focus:bg-white
                         focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 rounded-xl
                         outline-none transition-all text-sm font-medium shadow-inner"
            />
          </div>

          <div className="flex items-center gap-3 pl-6">
            <div className="text-right hidden xl:block mr-2">
              <p className="text-sm font-bold text-gray-800">{userData?.name}</p>
              <div className="flex items-center gap-1 justify-end">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/>
                <p className="text-[10px] text-emerald-600 font-bold uppercase">Turno Abierto</p>
              </div>
            </div>

            {canRegisterExpenses && (
              <div className="relative">
                <button
                  onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 rounded-xl
                             hover:bg-slate-50 transition-all font-bold text-sm border border-slate-200
                             hover:border-slate-300 shadow-sm active:scale-95"
                >
                  <MoreVertical size={18}/> <span className="hidden lg:inline">Opciones</span>
                </button>

                {showOptionsMenu && (
                  <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-fadeIn ring-1 ring-black/5">
                    <button
                      onClick={() => { setShowExpenseModal(true); setShowOptionsMenu(false); }}
                      className="w-full text-left px-4 py-3.5 hover:bg-rose-50 text-rose-600 font-bold text-sm flex items-center gap-3 transition-colors"
                    >
                      <div className="bg-rose-100 p-1.5 rounded-lg"><TrendingDown size={16}/></div>
                      Registrar Gasto
                    </button>
                    <button
                      onClick={fetchRecentSales}
                      className="w-full text-left px-4 py-3.5 hover:bg-slate-50 text-slate-700 font-bold text-sm flex items-center gap-3 border-t border-gray-100 transition-colors"
                    >
                      <div className="bg-slate-100 p-1.5 rounded-lg"><Ban size={16}/></div>
                      Anular Venta
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={prepareCloseShift}
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 text-rose-600 rounded-xl
                         hover:bg-rose-100 transition-all font-bold text-sm border border-rose-100
                         hover:border-rose-200 shadow-sm active:scale-95"
            >
              <LogOut size={18}/> <span className="hidden lg:inline">Cerrar</span>
            </button>
          </div>
        </div>

        {/* BARRA CATEGORÍAS */}
        <div className="h-16 bg-white/80 backdrop-blur-md border-b border-gray-200 flex items-center px-6 gap-3 overflow-x-auto shrink-0 scrollbar-hide z-10 sticky top-20">
          <div className="shrink-0 flex items-center scale-90 origin-left">
            <WeatherWidget/>
          </div>
          <div className="h-8 w-px bg-gray-300 mx-2 shrink-0"/>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all duration-200 active:scale-95 shadow-sm
                ${selectedCategory === cat
                  ? 'bg-slate-800 text-white shadow-lg shadow-slate-500/30'
                  : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-gray-800 hover:shadow-md'}`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* GRID DE PRODUCTOS */}
        <div className="flex-1 p-6 overflow-y-auto bg-slate-100">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-5 pb-20">
            {filteredProducts.map((product, idx) => {
              const stockVal  = parseFloat(product.stock);
              const minVal    = parseFloat(product.low_stock);
              const isLowStock = stockVal <= minVal;

              return (
                <div
                  key={idx}
                  onClick={() => addToCart(product)}
                  className="bg-white p-4 rounded-2xl shadow-sm hover:shadow-xl border border-transparent hover:border-emerald-500/30 cursor-pointer hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between h-48 relative overflow-hidden group"
                >
                  <div
                    className="absolute top-0 left-0 w-full h-1.5 transition-colors group-hover:bg-emerald-500"
                    style={{ backgroundColor: product.color || '#cbd5e1' }}
                  />
                  <div className={`absolute top-4 right-3 text-[10px] font-black px-2.5 py-1 rounded-lg border shadow-sm
                    ${isLowStock ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}
                  >
                    {product.soldBy === 'weight'
                      ? parseFloat(product.stock).toFixed(2) + ' kg'
                      : product.stock + ' u.'}
                  </div>
                  <div className="mt-3 pl-1 pt-2">
                    <h3 className="font-bold text-gray-800 text-sm leading-snug line-clamp-2 mb-1 group-hover:text-emerald-700 transition-colors">
                      {product.name}
                    </h3>
                    {product.sku && (
                      <p className="text-[10px] text-gray-400 flex items-center gap-1 font-mono tracking-wide">
                        <Barcode size={10}/> {product.sku}
                      </p>
                    )}
                  </div>
                  <div className="pl-1 mt-auto">
                    <span className="block text-emerald-600 font-black text-2xl tracking-tight">
                      ₲ {product.price?.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── CARRITO (SIDEBAR DERECHO) ──────────────────────────────────── */}
      <div className="w-96 bg-gray-50 border-l border-gray-200 flex flex-col shadow-2xl z-30 h-full">

        {/* Cart Header */}
        <div className="h-20 flex items-center justify-between px-6 bg-slate-900 text-white shadow-md shrink-0">
          <div className="flex items-center gap-3 font-bold text-lg">
            <ShoppingCart size={22} className="text-emerald-400"/>
            <span>Ticket de Venta</span>
          </div>
          <div className="text-xs font-bold bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700">
            {cart.length} Items
          </div>
        </div>

        {/* Items del carrito */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 custom-scrollbar">
          {cart.map(item => (
            <div key={item.id} className="flex gap-3 bg-white p-3 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
              <div className="flex flex-col items-center justify-between bg-slate-50 rounded-lg w-10 py-1 border border-slate-100">
                <button onClick={() => updateQuantity(item.id, 1)} className="text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded p-0.5 transition-colors">
                  <Plus size={14}/>
                </button>
                <input
                  type="number"
                  step={item.soldBy === 'weight' ? '0.001' : '1'}
                  value={item.quantity}
                  onChange={e => handleQuantityChange(item.id, e.target.value)}
                  className="w-full text-center bg-transparent font-bold text-sm focus:outline-none p-0 appearance-none text-gray-700"
                />
                <button onClick={() => updateQuantity(item.id, -1)} className="text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded p-0.5 transition-colors">
                  <Minus size={14}/>
                </button>
              </div>
              <div className="flex-1 py-1">
                <p className="text-sm font-bold text-gray-800 line-clamp-2 leading-tight">{item.name}</p>
                <p className="text-[10px] text-gray-400 font-medium mt-1">Unit: ₲ {item.price.toLocaleString()}</p>
              </div>
              <div className="text-right flex flex-col justify-between items-end py-1">
                <p className="text-sm font-black text-gray-800">₲ {(item.price * item.quantity).toLocaleString()}</p>
                <button onClick={() => removeFromCart(item.id)} className="text-gray-300 hover:text-rose-500 transition-colors p-1 rounded-lg hover:bg-rose-50">
                  <Trash2 size={16}/>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Cart Footer */}
        <div className="p-6 bg-white border-t border-gray-200 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-20">

          {/* Descuentos */}
          <div className="mb-4">
            <button
              onClick={() => setShowDiscountModal(true)}
              className={`w-full text-xs font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 border border-dashed
                ${appliedDiscounts.length > 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-slate-50 text-slate-500 border-slate-300 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300'}`}
            >
              <Tag size={16}/> {appliedDiscounts.length > 0 ? 'Editar Promos' : 'Aplicar Desc/Promo'}
            </button>

            {appliedDiscounts.length > 0 && (
              <div className="mt-2 space-y-1 bg-emerald-50 p-3 rounded-xl border border-emerald-100 text-[10px]">
                {appliedDiscounts.map(d => (
                  <div key={d.id} className="flex justify-between font-bold text-emerald-700">
                    <span>{d.quantity}x {d.name}</span>
                    <span>- ₲ {(d.type === 'fixed'
                      ? d.value * d.quantity
                      : (subTotalAmount * (d.value / 100)) * d.quantity
                    ).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Totales */}
          <div className="flex justify-between text-gray-500 text-sm mb-1 font-medium">
            <span>Subtotal</span>
            <span>₲ {subTotalAmount.toLocaleString()}</span>
          </div>

          {discountTotal > 0 && (
            <div className="flex justify-between text-emerald-600 font-bold text-sm mb-3">
              <span>Descuento</span>
              <span>- ₲ {discountTotal.toLocaleString()}</span>
            </div>
          )}

          <div className="flex justify-between items-end text-gray-900 mb-6">
            <span className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Total a Pagar</span>
            <span className="text-3xl font-black text-emerald-700">₲ {finalTotalAmount.toLocaleString()}</span>
          </div>

          {/* Botones acción */}
          <div className="grid grid-cols-4 gap-3">
            <button
              onClick={() => { if (window.confirm('¿Vaciar el carrito?')) { setCart([]); setAppliedDiscounts([]); } }}
              disabled={cart.length === 0}
              className="col-span-1 flex items-center justify-center p-3 rounded-xl border-2 border-slate-100 text-gray-400 hover:border-rose-100 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50 transition-all"
            >
              <Trash2 size={22}/>
            </button>
            <button
              onClick={() => setShowPaymentModal(true)}
              disabled={cart.length === 0}
              className="col-span-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all text-lg tracking-wide"
            >
              <CreditCard size={22}/> COBRAR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}