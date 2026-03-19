import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, addDoc, doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { sileo } from 'sileo';
import {
  Truck, Search, Plus, Minus, Trash2, Save,
  Package, Barcode, RefreshCw, ClipboardList,
  Info, X, CheckCircle
} from 'lucide-react';

export default function StockEntry() {
  const { userData } = useAuth();

  // ── Catálogo ────────────────────────────────────────────────────────────────
  const [products,    setProducts]    = useState([]);
  const [categories,  setCategories]  = useState(['Todas']);
  const [loadingInit, setLoadingInit] = useState(true);

  // ── Filtros ─────────────────────────────────────────────────────────────────
  const [search,      setSearch]      = useState('');
  const [selCategory, setSelCategory] = useState('Todas');

  // ── Formulario entrada ──────────────────────────────────────────────────────
  const [supplier,  setSupplier]  = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [notes,     setNotes]     = useState('');

  // Fecha de la entrada — hoy por defecto, editable para cargas retroactivas
  const todayStr = () => {
    const now = new Date();
    const off = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - off).toISOString().split('T')[0];
  };
  const [entryDateStr, setEntryDateStr] = useState(todayStr);

  // ── Carrito de entrada ──────────────────────────────────────────────────────
  const [entryCart, setEntryCart] = useState([]); // [{ ...product, qtyIn, newCost }]

  // ── Estado guardado ─────────────────────────────────────────────────────────
  const [saving,   setSaving]   = useState(false);
  const [lastEntry, setLastEntry] = useState(null); // resumen del último guardado

  // ── Carga de productos ──────────────────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'products'));
      const raw  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const flat = [];

      raw.forEach(p => {
        const soldBy = p.sold_by || 'unit';
        if (p.variants?.length > 0) {
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
                currentStock: parseFloat(v.stock || 0),
              });
            }
          });
        } else {
          flat.push({
            ...p,
            originalId:   p.id,
            isVariant:    false,
            soldBy,
            currentStock: parseFloat(p.current_stock || 0),
          });
        }
      });

      setProducts(flat);
      setCategories(['Todas', ...new Set(raw.map(p => p.category).filter(Boolean))]);
    } catch (e) {
      console.error(e);
      sileo.error({ title: 'Error al cargar productos.' });
    } finally {
      setLoadingInit(false);
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // ── Carrito ─────────────────────────────────────────────────────────────────
  const addToEntry = (product) => {
    setEntryCart(prev => {
      if (prev.find(i => i.id === product.id)) return prev;
      return [...prev, {
        ...product,
        qtyIn:   1,
        newCost: parseFloat(product.cost || 0),
      }];
    });
  };

  const removeFromEntry = (id) => setEntryCart(prev => prev.filter(i => i.id !== id));

  const updateField = (id, field, value) => {
    setEntryCart(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  // ── Guardar ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (entryCart.length === 0)   return sileo.warning({ title: 'Agregá al menos un producto a la entrada.' });
    if (!supplier.trim())          return sileo.warning({ title: 'Ingresá el nombre del proveedor.' });

    const hasInvalid = entryCart.some(i => !i.qtyIn || parseFloat(i.qtyIn) <= 0);
    if (hasInvalid)                return sileo.warning({ title: 'Todas las cantidades deben ser mayores a 0.' });

    setSaving(true);
    try {
      // Construir la fecha seleccionada (mediodía para evitar desfase de zona horaria)
      const [sy, sm, sd] = entryDateStr.split('-').map(Number);
      const entryDate = new Date(sy, sm - 1, sd, 12, 0, 0, 0);
      const batch     = writeBatch(db);

      // 1. Actualizar stock de cada producto
      const productDataMap = {};
      const uniqueOrigIds  = [...new Set(entryCart.map(i => i.originalId))];
      const snaps          = await Promise.all(uniqueOrigIds.map(id => getDoc(doc(db, 'products', id))));
      snaps.forEach(s => { if (s.exists()) productDataMap[s.id] = s.data(); });

      for (const item of entryCart) {
        const pd  = productDataMap[item.originalId];
        if (!pd) continue;
        const ref = doc(db, 'products', item.originalId);
        const qty = parseFloat(item.qtyIn);

        if (item.isVariant) {
          const updated = [...(pd.variants || [])];
          if (updated[item.variantIndex]) {
            updated[item.variantIndex] = {
              ...updated[item.variantIndex],
              stock: parseFloat(updated[item.variantIndex].stock || 0) + qty,
              cost:  parseFloat(item.newCost) || updated[item.variantIndex].cost,
            };
            batch.update(ref, { variants: updated });
          }
        } else {
          batch.update(ref, {
            current_stock: parseFloat(pd.current_stock || 0) + qty,
            cost:          parseFloat(item.newCost) || pd.cost,
          });
        }
      }

      await batch.commit();

      // 2. Registrar logs de inventario
      await Promise.all(entryCart.map(item => {
        const pd  = productDataMap[item.originalId];
        const prevStock = item.isVariant
          ? parseFloat(pd?.variants?.[item.variantIndex]?.stock || 0)
          : parseFloat(pd?.current_stock || 0);

        return addDoc(collection(db, 'inventory_logs'), {
          productId:   item.originalId,
          // Para variantes: "Café / 500g", para productos simples: "Café"
          // InventoryHistoryGlobal usa 'variantName' para mostrar en la columna PRODUCTO / VARIANTE
          variantName: item.name,
          type:        'add',
          change:      parseFloat(item.qtyIn),
          finalStock:  prevStock + parseFloat(item.qtyIn),
          reason:      'Compra a Proveedor',
          note:        `Proveedor: ${supplier}${invoiceNo ? ' — Factura: ' + invoiceNo : ''}${notes ? ' — ' + notes : ''}`,
          user:        userData?.name || 'Admin',
          date:        entryDate,
          entrySource: 'stock_entry',
        });
      }));

      // 3. Guardar resumen de entrada en colección stock_entries
      const entryDoc = await addDoc(collection(db, 'stock_entries'), {
        supplier,
        invoiceNo:    invoiceNo.trim() || null,
        notes:        notes.trim()    || null,
        registeredBy: userData?.name  || 'Admin',
        date:         entryDate,
        items:        entryCart.map(i => ({
          productId:   i.originalId,
          productName: i.name,
          qtyIn:       parseFloat(i.qtyIn),
          newCost:     parseFloat(i.newCost) || 0,
        })),
        totalItems: entryCart.length,
        totalUnits: entryCart.reduce((acc, i) => acc + parseFloat(i.qtyIn), 0),
      });

      // 4. Feedback y reset
      setLastEntry({
        id:       entryDoc.id,
        supplier,
        items:    entryCart.length,
        date:     entryDate.toLocaleString('es-PY'),
      });
      sileo.success({ title: `Entrada de ${entryCart.length} producto(s) registrada.`, description: `Proveedor: ${supplier}` });
      setEntryCart([]);
      setSupplier('');
      setInvoiceNo('');
      setNotes('');
      setEntryDateStr(todayStr());
      await fetchProducts();

    } catch (e) {
      console.error(e);
      sileo.error({ title: 'Error al guardar la entrada.' });
    } finally {
      setSaving(false);
    }
  };

  // ── Filtrado ─────────────────────────────────────────────────────────────────
  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
                        (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));
    const matchCat    = selCategory === 'Todas' || p.category === selCategory;
    return matchSearch && matchCat;
  });

  if (loadingInit) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <RefreshCw className="animate-spin text-primary" size={40}/>
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto pb-20">

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Truck className="text-blue-600" size={26}/>
            Entrada de Mercadería
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Registrá la mercadería recibida de un proveedor. El stock se actualiza automáticamente.
          </p>
        </div>
        {lastEntry && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 px-4 py-2.5 rounded-xl text-xs font-bold">
            <CheckCircle size={14}/>
            Última entrada: {lastEntry.items} producto(s) — {lastEntry.supplier}
          </div>
        )}
      </div>

      {/* BANNER */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-800">
        <Info size={17} className="shrink-0 mt-0.5 text-blue-500"/>
        <p className="text-blue-700 leading-relaxed">
          Seleccioná los productos recibidos, ingresá la cantidad que llegó y el nuevo costo si cambió.
          Al guardar se suman las unidades al stock actual y se registra un log de inventario por cada producto.
        </p>
      </div>

      <div className="flex gap-4 items-start">

        {/* ── CATÁLOGO ────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={18}/>
              <input type="text" placeholder="Buscar por nombre o código..."
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm
                           bg-gray-50 focus:bg-white focus:outline-none focus:border-blue-400"/>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map(cat => (
                <button key={cat} onClick={() => setSelCategory(cat)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0
                    ${selCategory === cat
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Grid productos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filtered.length === 0 ? (
              <div className="col-span-4 text-center py-16 text-gray-400">
                <Package size={40} className="mx-auto mb-2 opacity-20"/>
                <p>No se encontraron productos.</p>
              </div>
            ) : filtered.map((product, idx) => {
              const inEntry = entryCart.find(i => i.id === product.id);
              return (
                <div key={idx} onClick={() => !inEntry && addToEntry(product)}
                  className={`bg-white p-3.5 rounded-xl border-2 relative overflow-hidden transition-all duration-200
                    ${inEntry
                      ? 'border-blue-400 shadow-md shadow-blue-100 cursor-default'
                      : 'border-transparent hover:border-blue-200 shadow-sm hover:shadow-md cursor-pointer hover:-translate-y-0.5'}`}>
                  <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: product.color || '#cbd5e1' }}/>

                  {inEntry && (
                    <div className="absolute top-2.5 right-2.5 bg-blue-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full">
                      +{inEntry.qtyIn}
                    </div>
                  )}

                  <div className="mt-3 mb-1.5">
                    <p className="font-bold text-gray-800 text-xs leading-snug line-clamp-2 pr-6">{product.name}</p>
                    {product.sku && (
                      <p className="text-[9px] text-gray-400 font-mono mt-0.5 flex items-center gap-1">
                        <Barcode size={9}/> {product.sku}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-blue-600 font-black text-sm">
                      ₲ {parseFloat(product.price || 0).toLocaleString()}
                    </p>
                    <span className="text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-bold">
                      Stock: {product.currentStock}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── PANEL DERECHO ───────────────────────────────────────── */}
        <div className="w-80 shrink-0 space-y-4 sticky top-6">

          {/* Datos de la entrada */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
              <Truck size={16} className="text-blue-500"/> Datos de la Entrada
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Fecha de Entrada
                </label>
                <input
                  type="date"
                  value={entryDateStr}
                  max={todayStr()}
                  onChange={e => setEntryDateStr(e.target.value)}
                  className="w-full border-2 rounded-lg p-2.5 text-sm focus:outline-none focus:border-blue-400 border-gray-200"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Modificá si la mercadería llegó en una fecha anterior.
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Proveedor *</label>
                <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)}
                  placeholder="Ej: Distribuidora López"
                  className={`w-full border-2 rounded-lg p-2.5 text-sm focus:outline-none transition-all
                    ${supplier ? 'border-blue-300 bg-blue-50 text-blue-800 font-bold' : 'border-gray-200'}`}/>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">N° Factura (opcional)</label>
                <input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)}
                  placeholder="Ej: 001-001-0000456"
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:border-blue-400"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Observaciones (opcional)</label>
                <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Ej: Llegó en buen estado, sin faltantes..."
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-xs resize-none focus:outline-none focus:border-blue-400"/>
              </div>
            </div>
          </div>

          {/* Carrito de entrada */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
              <span className="font-bold text-sm">Productos a Ingresar</span>
              <span className="text-xs bg-slate-700 px-2 py-1 rounded-full font-bold text-slate-300">
                {entryCart.length} items
              </span>
            </div>

            {entryCart.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">
                <ClipboardList size={32} className="mx-auto mb-2 opacity-20"/>
                <p>Hacé clic en un producto para agregarlo</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {entryCart.map(item => (
                  <div key={item.id} className="px-3 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold text-gray-800 leading-tight flex-1">{item.name}</p>
                      <button onClick={() => removeFromEntry(item.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors shrink-0">
                        <X size={14}/>
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] text-gray-400 font-bold uppercase">Cantidad entrante</label>
                        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden mt-0.5">
                          <button onClick={() => updateField(item.id, 'qtyIn', Math.max(0.001, parseFloat(item.qtyIn) - 1))}
                            className="px-2 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 text-xs">
                            <Minus size={11}/>
                          </button>
                          <input type="number" step={item.soldBy === 'weight' ? '0.001' : '1'}
                            value={item.qtyIn}
                            onChange={e => updateField(item.id, 'qtyIn', e.target.value)}
                            className="flex-1 text-center text-sm font-black text-blue-700 py-1.5 focus:outline-none"/>
                          <button onClick={() => updateField(item.id, 'qtyIn', parseFloat(item.qtyIn) + 1)}
                            className="px-2 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 text-xs">
                            <Plus size={11}/>
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400 mt-1">
                          Stock actual: <strong>{item.currentStock}</strong>
                          {' → '}
                          <strong className="text-green-600">{parseFloat(item.currentStock) + parseFloat(item.qtyIn || 0)}</strong>
                        </p>
                      </div>
                      <div>
                        <label className="text-[9px] text-gray-400 font-bold uppercase">Nuevo costo (₲)</label>
                        <input type="number" value={item.newCost}
                          onChange={e => updateField(item.id, 'newCost', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg p-1.5 text-xs font-mono text-center
                                     focus:outline-none focus:border-blue-400 mt-0.5"
                          placeholder="0"/>
                        {parseFloat(item.newCost) !== parseFloat(item.cost || 0) && (
                          <p className="text-[9px] text-amber-600 font-bold mt-0.5">⚠ Costo cambia</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-gray-200 p-4 bg-gray-50">
              <div className="flex justify-between items-center mb-3 text-sm text-gray-500">
                <span>Total unidades</span>
                <span className="font-black text-gray-900 text-lg">
                  {entryCart.reduce((acc, i) => acc + parseFloat(i.qtyIn || 0), 0).toLocaleString('es-PY', {maximumFractionDigits: 3})}
                </span>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setEntryCart([])} disabled={entryCart.length === 0}
                  className="px-3 py-3 rounded-xl border-2 border-gray-200 text-gray-400
                             hover:border-red-200 hover:bg-red-50 hover:text-red-500
                             disabled:opacity-40 transition-all">
                  <Trash2 size={18}/>
                </button>
                <button onClick={handleSave}
                  disabled={saving || entryCart.length === 0 || !supplier.trim()}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3
                             rounded-xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2
                             disabled:opacity-50 active:scale-95 transition-all text-sm">
                  {saving
                    ? <><RefreshCw size={18} className="animate-spin"/> Guardando...</>
                    : <><Save size={18}/> GUARDAR ENTRADA</>}
                </button>
              </div>
              {(!supplier.trim() || entryCart.length === 0) && (
                <p className="text-center text-[10px] text-red-400 font-bold mt-2">
                  {!supplier.trim() && entryCart.length === 0
                    ? 'Ingresá el proveedor y agregá productos'
                    : !supplier.trim() ? 'Falta el nombre del proveedor'
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