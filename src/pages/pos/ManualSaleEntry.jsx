import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  collection, getDocs, addDoc, doc, getDoc,
  runTransaction, writeBatch
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  Search, Plus, Minus, Trash2, Save, User,
  Calendar, CreditCard, Package, Barcode,
  AlertTriangle, CheckCircle, RefreshCw, Tag,
  ClipboardList, ChevronDown, Info, Loader2, X
} from 'lucide-react';
import DiscountModal from './DiscountModal';
import { sileo } from 'sileo';
import { todayStrPY } from '../../utils/dateUtils';

// ── Helper: genera el próximo ticket (atómico, igual que PosTerminal) ─────────
async function generateTicketId(db) {
  const settingsRef = doc(db, 'settings', 'general');
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(settingsRef);
      if (!snap.exists() || !snap.data()?.ticketNumbering) {
        const ts = Date.now().toString().slice(-6);
        const ds = new Date().toISOString().slice(2, 10).replace(/-/g, '');
        return `T-${ds}-${ts}-M`;
      }
      const current  = snap.data().ticketNumbering.trim();
      const lastDash = current.lastIndexOf('-');
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
  } catch {
    const ts = Date.now().toString().slice(-6);
    const ds = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    return `T-${ds}-${ts}-M`;
  }
}

const todayStr = () => todayStrPY();

export default function ManualSaleEntry() {
  const { userData } = useAuth();

  // ── Catálogo ────────────────────────────────────────────────────────────────
  const [products,    setProducts]    = useState([]);
  const [categories,  setCategories]  = useState(['Todas']);
  const [employees,   setEmployees]   = useState([]);
  const [loadingInit, setLoadingInit] = useState(true);

  // ── Filtros de producto ─────────────────────────────────────────────────────
  const [searchTerm,       setSearchTerm]       = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');

  // ── Config de la venta ──────────────────────────────────────────────────────
  const [saleDate,      setSaleDate]      = useState(todayStr());
  const [cashierId,     setCashierId]     = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes,         setNotes]         = useState('');
  const [updateStock,   setUpdateStock]   = useState(false);

  // ── Carrito ─────────────────────────────────────────────────────────────────
  const [cart, setCart] = useState([]);

  // ── Descuentos ──────────────────────────────────────────────────────────────
  const [appliedDiscounts,  setAppliedDiscounts]  = useState([]);
  const [showDiscountModal, setShowDiscountModal] = useState(false);

  // ── Guardado ────────────────────────────────────────────────────────────────
  const [saving,        setSaving]        = useState(false);
  const [savedTicketId, setSavedTicketId] = useState(null);

  // ────────────────────────────────────────────────────────────────────────────
  // CARGA INICIAL
  // ────────────────────────────────────────────────────────────────────────────
  const fetchCatalog = useCallback(async () => {
    try {
      const [prodSnap, empSnap] = await Promise.all([
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'employees')),
      ]);

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
          flat.push({ ...p, originalId: p.id, isVariant: false, soldBy, stock: p.current_stock || 0, low_stock: lowStock });
        }
      });
      setProducts(flat);
      setCategories(['Todas', ...new Set(prodsData.map(p => p.category).filter(Boolean))]);

      const emps = empSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEmployees(emps);
      if (emps.length === 1) setCashierId(emps[0].id);
    } catch (e) {
      console.error('Error cargando catálogo:', e);
      sileo.error('Error al cargar productos o empleados.');
    } finally {
      setLoadingInit(false);
    }
  }, []);

  useEffect(() => { fetchCatalog(); }, [fetchCatalog]);

  // ────────────────────────────────────────────────────────────────────────────
  // CARRITO
  // ────────────────────────────────────────────────────────────────────────────
  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (id) => {
    setCart(prev => prev.filter(i => i.id !== id));
  };

  const updateQuantity = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id !== id) return item;
      const minQty = item.soldBy === 'weight' ? 0.001 : 1;
      const newQty = Math.max(minQty, item.quantity + delta);
      return { ...item, quantity: parseFloat(newQty.toFixed(3)) };
    }));
  };

  const handleQuantityChange = (id, value) => {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    const val = item.soldBy === 'weight' ? parseFloat(value) : parseInt(value);
    if (isNaN(val) || val <= 0) return;
    setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: val } : i));
  };

  const handlePriceChange = (id, value) => {
    const val = parseFloat(value);
    if (isNaN(val) || val < 0) return;
    setCart(prev => prev.map(i => i.id === id ? { ...i, price: val } : i));
  };

  // ────────────────────────────────────────────────────────────────────────────
  // CÁLCULOS CON DESCUENTOS
  // ────────────────────────────────────────────────────────────────────────────
  const subTotal = cart.reduce((acc, i) => acc + i.price * i.quantity, 0);

  const discountTotal = appliedDiscounts.reduce((acc, d) => {
    const val = d.type === 'fixed'
      ? d.value * d.quantity
      : (subTotal * (d.value / 100)) * d.quantity;
    return acc + val;
  }, 0);

  const finalTotal = Math.max(0, subTotal - discountTotal);

  // ────────────────────────────────────────────────────────────────────────────
  // FILTRO DE PRODUCTOS
  // ────────────────────────────────────────────────────────────────────────────
  const filteredProducts = products.filter(p => {
    const matchSearch   = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchCategory = selectedCategory === 'Todas' || p.category === selectedCategory;
    return matchSearch && matchCategory;
  });

  // ────────────────────────────────────────────────────────────────────────────
  // GUARDAR VENTA MANUAL
  // ────────────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (cart.length === 0)  return sileo.warning('Agregue al menos un producto al ticket.');
    if (!cashierId)         return sileo.warning('Seleccione el cajero que realizó la venta.');
    if (!saleDate)          return sileo.warning('Seleccione la fecha de la venta.');

    const cashier = employees.find(e => e.id === cashierId);
    if (!cashier)           return sileo.warning('Cajero no encontrado, recargue la página.');

    const [sy, sm, sd] = saleDate.split('-').map(Number);
    const saleDateTime = new Date(sy, sm - 1, sd, 12, 0, 0);

    setSaving(true);
    try {
      const ticketId = await generateTicketId(db);

      let totalCost = 0;
      const itemsProcessed = cart.map(item => {
        const qty  = parseFloat(item.quantity || 0);
        const cost = parseFloat(item.cost     || 0);
        totalCost += cost * qty;
        return { id: item.id, name: item.name, quantity: item.quantity, price: item.price, cost: item.cost || 0, tax: item.tax || 10, soldBy: item.soldBy };
      });

      const saleData = {
        ticketId,
        userId:           cashier.id,
        userName:         cashier.name,
        shiftId:          'MANUAL_ENTRY',
        date:             saleDateTime,
        subTotal,
        discountTotal,
        appliedDiscounts,
        total:            finalTotal,
        paymentMethod,
        amountReceived:   finalTotal,
        change:           0,
        client:           { name: 'CONSUMIDOR FINAL', ruc: 'X', address: '' },
        items:            itemsProcessed,
        status:           'completed',
        source:           'manual',
        notes:            notes.trim() || '',
        registeredBy:     userData.name,
        registeredAt:     new Date(),
      };

      await addDoc(collection(db, 'sales'), saleData);

      // Descontar stock si fue solicitado
      if (updateStock) {
        const uniqueIds      = [...new Set(cart.map(i => i.originalId))];
        const productSnaps   = await Promise.all(uniqueIds.map(id => getDoc(doc(db, 'products', id))));
        const productDataMap = {};
        productSnaps.forEach(snap => { if (snap.exists()) productDataMap[snap.id] = snap.data(); });

        const stockBatch = writeBatch(db);
        for (const item of cart) {
          const pd = productDataMap[item.originalId];
          if (!pd) continue;
          const pRef = doc(db, 'products', item.originalId);
          if (item.isVariant) {
            const upd = [...pd.variants];
            if (upd[item.variantIndex]) {
              upd[item.variantIndex].stock = Math.max(0, parseFloat(upd[item.variantIndex].stock || 0) - item.quantity);
              stockBatch.update(pRef, { variants: upd });
            }
          } else {
            stockBatch.update(pRef, { current_stock: Math.max(0, parseFloat(pd.current_stock || 0) - item.quantity) });
          }
        }
        await stockBatch.commit();
      }

      setSavedTicketId(ticketId);
      sileo.success(`✅ Venta ${ticketId} guardada para ${cashier.name}.`);
      setCart([]);
      setNotes('');
      setAppliedDiscounts([]);

    } catch (e) {
      console.error(e);
      sileo.error('Error al guardar la venta manual. Intente nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  if (loadingInit) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  const selectedCashier = employees.find(e => e.id === cashierId);

  return (
    <div className="max-w-[1400px] mx-auto pb-20">

      {/* ── DISCOUNT MODAL ───────────────────────────────────────────── */}
      {showDiscountModal && (
        <DiscountModal
          onClose={() => setShowDiscountModal(false)}
          onApply={discounts => { setAppliedDiscounts(discounts); setShowDiscountModal(false); }}
        />
      )}

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ClipboardList className="text-indigo-600" size={26} />
            Registro Manual de Ventas
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Cargá las ventas del papel entregado por tu cajero con la fecha y el cajero correctos.
          </p>
        </div>
        {savedTicketId && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 px-4 py-2.5 rounded-xl text-sm font-bold">
            <CheckCircle size={16} />
            Último guardado: <span className="font-mono">{savedTicketId}</span>
          </div>
        )}
      </div>

      {/* ── BANNER INFORMATIVO ─────────────────────────────────────────── */}
      <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6 text-sm text-indigo-800">
        <Info size={18} className="shrink-0 mt-0.5 text-indigo-500" />
        <div>
          <p className="font-bold mb-0.5">¿Para qué sirve esto?</p>
          <p className="text-indigo-700 leading-relaxed">
            Cargá las ventas que ya pasaron y tenés en papel. Elegí la fecha real, el cajero,
            completá los productos y aplicá descuentos si los hubo. La venta se registra
            con esa fecha y cajero, exactamente igual que desde el TPV.
          </p>
        </div>
      </div>

      <div className="flex gap-6 items-start">

        {/* ── CATÁLOGO DE PRODUCTOS ──────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Buscar producto por nombre o código..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm
                           bg-gray-50 focus:bg-white focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {categories.map(cat => (
                <button key={cat} onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0
                    ${selectedCategory === cat
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-800'}`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Grid de productos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredProducts.length === 0 ? (
              <div className="col-span-4 text-center py-16 text-gray-400">
                <Package size={40} className="mx-auto mb-2 opacity-20" />
                <p>No se encontraron productos.</p>
              </div>
            ) : filteredProducts.map((product, idx) => {
              const inCart   = cart.find(i => i.id === product.id);
              const stockVal = parseFloat(product.stock || 0);
              const isLow    = stockVal <= parseFloat(product.low_stock || 5);
              return (
                <div key={idx} onClick={() => addToCart(product)}
                  className={`bg-white p-3.5 rounded-xl border-2 cursor-pointer
                               hover:-translate-y-0.5 transition-all duration-200 relative overflow-hidden
                               ${inCart ? 'border-indigo-400 shadow-md shadow-indigo-100'
                                        : 'border-transparent hover:border-indigo-200 shadow-sm hover:shadow-md'}`}>
                  <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: product.color || '#cbd5e1' }} />
                  {inCart && (
                    <div className="absolute top-2.5 right-2.5 bg-indigo-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow">
                      ×{inCart.quantity}
                    </div>
                  )}
                  {!inCart && (
                    <div className={`absolute top-2.5 right-2.5 text-[9px] font-bold px-2 py-0.5 rounded-full border
                      ${isLow ? 'bg-red-50 text-red-500 border-red-100' : 'bg-green-50 text-green-600 border-green-100'}`}>
                      {stockVal}{product.soldBy === 'weight' ? 'kg' : 'u'}
                    </div>
                  )}
                  <div className="mt-3 mb-1.5">
                    <p className="font-bold text-gray-800 text-xs leading-snug line-clamp-2 pr-6">{product.name}</p>
                    {product.sku && (
                      <p className="text-[9px] text-gray-400 font-mono mt-0.5 flex items-center gap-1">
                        <Barcode size={9} /> {product.sku}
                      </p>
                    )}
                  </div>
                  <p className="text-indigo-600 font-black text-base tracking-tight">
                    ₲ {parseFloat(product.price || 0).toLocaleString()}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── SIDEBAR DERECHO: CONFIG + CARRITO ─────────────────────── */}
        <div className="w-96 shrink-0 space-y-4 sticky top-6">

          {/* ── CONFIG DE LA VENTA ─────────────────────────────────── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
              <Tag size={16} className="text-indigo-500" /> Configuración de la Venta
            </h3>
            <div className="space-y-4">

              {/* Fecha */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5 flex items-center gap-1">
                  <Calendar size={11} /> Fecha de la Venta
                </label>
                <input type="date" value={saleDate} max={todayStr()}
                  onChange={e => setSaleDate(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-lg p-2.5 text-sm font-bold
                             text-gray-800 focus:outline-none focus:border-indigo-500 transition-all" />
                {saleDate !== todayStr() && (
                  <p className="text-[11px] text-amber-600 font-bold mt-1 flex items-center gap-1">
                    <AlertTriangle size={11} /> Fecha retroactiva — se guardará con esta fecha
                  </p>
                )}
              </div>

              {/* Cajero */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5 flex items-center gap-1">
                  <User size={11} /> Cajero que realizó la venta
                </label>
                <div className="relative">
                  <select value={cashierId} onChange={e => setCashierId(e.target.value)}
                    className={`w-full border-2 rounded-lg p-2.5 text-sm font-bold appearance-none
                               focus:outline-none focus:border-indigo-500 transition-all pr-8
                               ${cashierId ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-gray-200 text-gray-500'}`}>
                    <option value="">— Seleccionar cajero —</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.role === 'admin' ? 'Admin' : 'Cajero'})</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-2.5 top-3 text-gray-400 pointer-events-none" />
                </div>
                {selectedCashier && (
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-indigo-600 font-bold">
                    <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[9px] font-black">
                      {selectedCashier.name.substring(0, 2).toUpperCase()}
                    </div>
                    Registrando como: {selectedCashier.name}
                  </div>
                )}
              </div>

              {/* Método de pago */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5 flex items-center gap-1">
                  <CreditCard size={11} /> Método de Pago
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'cash',     label: 'Efectivo', icon: '💵' },
                    { id: 'qr',       label: 'QR',       icon: '📱' },
                    { id: 'card',     label: 'Tarjeta',  icon: '💳' },
                    { id: 'transfer', label: 'Transfer.', icon: '🏦' },
                  ].map(m => (
                    <button key={m.id} onClick={() => setPaymentMethod(m.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold
                                 transition-all border
                                 ${paymentMethod === m.id
                                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm'
                                    : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'}`}>
                      <span>{m.icon}</span> {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggle: Actualizar stock */}
              <div className={`flex items-start gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer
                ${updateStock ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}
                onClick={() => setUpdateStock(!updateStock)}>
                <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 transition-all border-2
                  ${updateStock ? 'bg-amber-500 border-amber-500' : 'bg-white border-gray-300'}`}>
                  {updateStock && <span className="text-white text-[10px] font-black">✓</span>}
                </div>
                <div>
                  <p className={`text-xs font-bold ${updateStock ? 'text-amber-800' : 'text-gray-700'}`}>
                    Descontar del stock actual
                  </p>
                  <p className={`text-[10px] mt-0.5 leading-tight ${updateStock ? 'text-amber-600' : 'text-gray-400'}`}>
                    {updateStock
                      ? '⚠️ Se reducirá el inventario. Activalo solo si el stock NO fue descontado aún.'
                      : 'El stock no se modificará (recomendado si el stock ya fue consumido).'}
                  </p>
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Notas internas (opcional)</label>
                <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Ej: Ventas del sábado 7/12, hoja de María..."
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-xs text-gray-700
                             focus:outline-none focus:border-indigo-400 resize-none bg-gray-50 focus:bg-white transition-all" />
              </div>
            </div>
          </div>

          {/* ── CARRITO ──────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
              <span className="font-bold text-sm">Productos del Ticket</span>
              <span className="text-xs bg-slate-700 px-2 py-1 rounded-full font-bold text-slate-300">
                {cart.length} items
              </span>
            </div>

            {cart.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">
                <Package size={32} className="mx-auto mb-2 opacity-20" />
                <p>Hacé clic en un producto para agregarlo</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {cart.map(item => (
                  <div key={item.id} className="px-3 py-2.5 flex items-center gap-2">
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => updateQuantity(item.id, -1)}
                        className="w-6 h-6 rounded bg-gray-100 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors">
                        <Minus size={11} />
                      </button>
                      <input type="number" step={item.soldBy === 'weight' ? '0.001' : '1'}
                        value={item.quantity} onChange={e => handleQuantityChange(item.id, e.target.value)}
                        className="w-10 text-center text-sm font-bold border border-gray-200 rounded p-0.5 focus:outline-none focus:border-indigo-400" />
                      <button onClick={() => updateQuantity(item.id, 1)}
                        className="w-6 h-6 rounded bg-gray-100 hover:bg-green-100 hover:text-green-600 flex items-center justify-center transition-colors">
                        <Plus size={11} />
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-800 truncate">{item.name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[9px] text-gray-400">₲</span>
                        <input type="number" value={item.price} onChange={e => handlePriceChange(item.id, e.target.value)}
                          className="w-20 text-[10px] font-mono text-gray-600 border-b border-dashed border-gray-300
                                     focus:outline-none focus:border-indigo-400 bg-transparent"
                          title="Precio editable" />
                        <span className="text-[9px] text-gray-400">/ u.</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-black text-gray-800">₲ {(item.price * item.quantity).toLocaleString()}</p>
                      <button onClick={() => removeFromCart(item.id)} className="text-gray-300 hover:text-red-500 transition-colors mt-0.5">
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── FOOTER: DESCUENTOS + TOTALES + GUARDAR ──────────── */}
            <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-3">

              {/* Botón aplicar descuento */}
              <button onClick={() => setShowDiscountModal(true)}
                className={`w-full text-xs font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 border border-dashed
                  ${appliedDiscounts.length > 0
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : 'bg-white text-slate-500 border-slate-300 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300'}`}>
                <Tag size={15} />
                {appliedDiscounts.length > 0 ? 'Editar Descuentos / Promos' : 'Aplicar Descuento / Promo'}
              </button>

              {/* Listado de descuentos aplicados */}
              {appliedDiscounts.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 space-y-1 text-[10px]">
                  {appliedDiscounts.map(d => (
                    <div key={d.id} className="flex justify-between font-bold text-emerald-700">
                      <span>{d.quantity}× {d.name}</span>
                      <span>− ₲ {(d.type === 'fixed'
                        ? d.value * d.quantity
                        : (subTotal * (d.value / 100)) * d.quantity
                      ).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Subtotal */}
              {discountTotal > 0 && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Subtotal</span>
                  <span>₲ {subTotal.toLocaleString()}</span>
                </div>
              )}

              {/* Descuento */}
              {discountTotal > 0 && (
                <div className="flex justify-between text-sm font-bold text-emerald-600">
                  <span>Descuento</span>
                  <span>− ₲ {discountTotal.toLocaleString()}</span>
                </div>
              )}

              {/* Total final */}
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500 font-medium">Total</span>
                <span className="text-2xl font-black text-gray-900">₲ {finalTotal.toLocaleString()}</span>
              </div>

              {/* Resumen antes de guardar */}
              {(cashierId || saleDate) && (
                <div className="text-[10px] text-gray-500 bg-white rounded-lg p-2 border border-gray-100 space-y-0.5">
                  <p>📅 Fecha: <strong className="text-gray-700">{saleDate || '—'}</strong></p>
                  <p>👤 Cajero: <strong className="text-gray-700">{selectedCashier?.name || '—'}</strong></p>
                  <p>💳 Pago: <strong className="text-gray-700">
                    {{ cash: 'Efectivo', qr: 'QR', card: 'Tarjeta', transfer: 'Transferencia' }[paymentMethod]}
                  </strong></p>
                  {updateStock && <p className="text-amber-600 font-bold">⚠️ Stock será descontado</p>}
                </div>
              )}

              {/* Botones */}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setCart([]); setNotes(''); setAppliedDiscounts([]); }} disabled={cart.length === 0}
                  className="px-3 py-3 rounded-xl border-2 border-gray-200 text-gray-400
                             hover:border-red-200 hover:bg-red-50 hover:text-red-500
                             disabled:opacity-40 transition-all" title="Vaciar carrito">
                  <Trash2 size={18} />
                </button>
                <button onClick={handleSave} disabled={saving || cart.length === 0 || !cashierId}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3
                             rounded-xl shadow-lg shadow-indigo-200 flex items-center justify-center gap-2
                             disabled:opacity-50 active:scale-95 transition-all text-sm tracking-wide">
                  {saving
                    ? <><RefreshCw size={18} className="animate-spin" /> Guardando...</>
                    : <><Save size={18} /> GUARDAR VENTA</>}
                </button>
              </div>

              {(!cashierId || cart.length === 0) && (
                <p className="text-center text-[10px] text-red-400 font-bold">
                  {!cashierId && cart.length === 0 ? 'Seleccioná un cajero y agregá productos'
                    : !cashierId ? 'Seleccioná el cajero antes de guardar'
                    : 'Agregá al menos un producto'}
                </p>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}