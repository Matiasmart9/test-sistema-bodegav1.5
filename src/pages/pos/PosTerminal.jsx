import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  collection, getDocs, addDoc, query, where, updateDoc, doc,
  limit, getDoc, increment, orderBy, runTransaction, writeBatch,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, LogOut,
  Clock, DollarSign, Barcode, TrendingDown, Printer, X, Tag,
  Store, MoreVertical, Ban, RefreshCcw, AlertCircle, Loader2, PrinterCheck,
  Package, WifiOff, ClipboardCheck, HandCoins, BookOpen, Receipt
} from 'lucide-react';
import PaymentModal from './PaymentModal';
import { formatTime } from '../../utils/dateUtils';
import { formatGuaranies, parseGuaraniesStr } from '../../utils/moneyUtils';
import { resolveFifoCost } from '../../utils/fifoUtils';
import ShiftCloseTicket from './ShiftCloseTicket';
import DiscountModal from './DiscountModal';
import WeatherWidget from '../../components/ui/WeatherWidget';
import { sileo } from 'sileo';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { printTicketService } from '../../utils/printUtils';
import CreditPaymentModal from './CreditPaymentModal';
import ManualDebtModal from '../../components/credit/ManualDebtModal';
import TicketPreviewModal from '../../components/credit/TicketPreviewModal';

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
  const navigate = useNavigate();
  const { userData, logout } = useAuth();

  // ── Sesión efectiva: prioriza pos_user de localStorage sobre Firebase Auth ──
  // Esto evita que la sesión del admin pise la del cajero cuando ambos están activos
  const effectiveUser = React.useMemo(() => {
    try {
      const stored = localStorage.getItem('pos_user');
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return userData;
  }, [userData]);

  // ── Permisos del cajero (también se usan en la pantalla de turno cerrado) ──
  const canRegisterExpenses          = effectiveUser?.role === 'admin' || effectiveUser?.canRegisterExpenses;
  const canManageInventorySummarized = effectiveUser?.role === 'admin' || effectiveUser?.canManageInventorySummarized;
  const canCheckCashierInventory     = effectiveUser?.role === 'admin' || effectiveUser?.canCheckCashierInventory;
  const canManageFiado               = effectiveUser?.role === 'admin' || effectiveUser?.canManageFiado;
  const canManualFiado               = effectiveUser?.role === 'admin' || effectiveUser?.canManualFiado;
  const hasInventoryAccess           = canManageInventorySummarized || canCheckCashierInventory;

  // Logout adaptado: si es cajero (localStorage), limpia solo pos_user
  const handleLogout = () => {
    localStorage.removeItem('pos_user');
    logout();
  };

  // --- MODAL DE CONFIRMACIÓN PARA ACCIONES DESTRUCTIVAS ---
  const [confirmModal, setConfirmModal] = useState(null);

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
  const [showCreditModal,   setShowCreditModal]   = useState(false);
  const [showManualCreditModal, setShowManualCreditModal] = useState(false);
  const [recentSales,       setRecentSales]       = useState([]);
  const [showReprintModal,  setShowReprintModal]  = useState(false);
  const [reprintSales,      setReprintSales]      = useState([]);
  const [reprintSearch,     setReprintSearch]     = useState('');
  const [voidSearch,        setVoidSearch]        = useState('');
  const [previewTicketSale, setPreviewTicketSale] = useState(null);

  // Datos para el gasto y cierre
  const [expenseData,   setExpenseData]   = useState({ amount: '', reason: '' });
  const [shiftSummary,  setShiftSummary]  = useState({ sales: 0, expenses: 0 });

  // --- ESTADO CONEXIÓN INTERNET ---
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ─── Carga de productos ──────────────────────────────────────────────────
  // ─── Carga de productos en tiempo real (Sincronización automática) ───────
  useEffect(() => {
    let unsubscribeProducts = () => {};

    const init = async () => {
      // 1. Escuchar la colección de productos en tiempo real
      unsubscribeProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
        const prodsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
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
      }, (error) => {
        console.error('Error onSnapshot productos:', error);
      });

      // 2. Cargar el turno activo del cajero
      if (effectiveUser?.id) {
        try {
          const q        = query(collection(db, 'shifts'), where('userId', '==', effectiveUser.id), where('status', '==', 'open'), limit(1));
          const shiftSnap = await getDocs(q);
          if (!shiftSnap.empty) setCurrentShift({ id: shiftSnap.docs[0].id, ...shiftSnap.docs[0].data() });
        } catch (error) {
          console.error(error);
        }
      }
      setLoading(false);
      setCheckingShift(false);
    };

    init();

    // Limpiar listener al desmontar o cambiar usuario
    return () => {
      unsubscribeProducts();
    };
  }, [effectiveUser]);

  // ─── Sincronizar el carrito cuando cambia el catálogo de productos ──────────
  useEffect(() => {
    if (products.length === 0 || cart.length === 0) return;
    setCart(prev => {
      let changed = false;
      const updated = prev.map(item => {
        const currentProd = products.find(p => p.id === item.id);
        if (!currentProd) return item;

        const stockDisponible = parseFloat(currentProd.stock || 0);
        // Limitar la cantidad agregada al stock actual disponible para evitar inconsistencias
        const cappedQty = Math.min(item.quantity, stockDisponible);

        // Verificar si hubo cambios en los datos críticos del producto
        if (
          item.price !== currentProd.price ||
          item.cost !== currentProd.cost ||
          item.tax !== currentProd.tax ||
          item.name !== currentProd.name ||
          item.quantity !== cappedQty
        ) {
          changed = true;
          return {
            ...item,
            name:     currentProd.name,
            price:    currentProd.price,
            cost:     currentProd.cost,
            tax:      currentProd.tax,
            quantity: cappedQty
          };
        }
        return item;
      });
      // Retornar la misma referencia si no cambió nada para evitar bucles de renderizado
      return changed ? updated : prev;
    });
  }, [products]);

  // ─── Carga todas las ventas activas del día actual + turno actual ────────
  const fetchDayAndShiftSales = async () => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const queries = [
      getDocs(query(collection(db, 'sales'), where('date', '>=', startOfDay), where('date', '<=', endOfDay))),
    ];
    if (currentShift?.id) {
      queries.push(getDocs(query(collection(db, 'sales'), where('shiftId', '==', currentShift.id))));
    }

    const snaps = await Promise.all(queries);
    const byId = new Map();
    snaps.forEach(snap => {
      snap.docs.forEach(d => {
        if (!byId.has(d.id)) {
          const data = d.data();
          byId.set(d.id, {
            id: d.id,
            ...data,
            dateObj: data.date?.toDate ? data.date.toDate() : new Date(data.date),
          });
        }
      });
    });

    return Array.from(byId.values())
      .filter(sale => sale.status !== 'canceled' && sale.source !== 'manual')
      .sort((a, b) => b.dateObj - a.dateObj);
  };

  const matchesSaleSearch = (sale, rawTerm) => {
    const term = (rawTerm || '').trim().toLowerCase();
    if (!term) return true;
    if ((sale.ticketId || '').toLowerCase().includes(term)) return true;
    if ((sale.client?.name || '').toLowerCase().includes(term)) return true;
    if ((sale.items || []).some(it => (it.name || '').toLowerCase().includes(term))) return true;
    return false;
  };

  // ─── Anulación de ventas ─────────────────────────────────────────────────
  const fetchRecentSales = async () => {
    if (!currentShift) return;
    try {
      const sales = await fetchDayAndShiftSales();
      setRecentSales(sales);
      setVoidSearch('');
      setShowVoidModal(true);
      setShowOptionsMenu(false);
    } catch (error) {
      console.error('Error fetching sales:', error);
      sileo.error({ title: 'Error al cargar ventas del día: ' + error.message });
    }
  };

  // ─── Reimprimir ticket ───────────────────────────────────────────────────
  const fetchReprintSales = async () => {
    if (!currentShift) return;
    try {
      const sales = await fetchDayAndShiftSales();
      setReprintSales(sales);
      setReprintSearch('');
      setShowReprintModal(true);
      setShowOptionsMenu(false);
    } catch (error) {
      sileo.error({ title: 'Error al cargar ventas: ' + error.message });
    }
  };

  const handleReprint = async (sale) => {
    // Reconstruir el objeto date si viene como Timestamp de Firestore
    const saleDate = sale.dateObj instanceof Date ? sale.dateObj
                   : sale.date?.toDate ? sale.date.toDate()
                   : new Date(sale.date);

    // Cargar config de tienda desde Firestore
    let storeData = {};
    try {
      const snap = await getDoc(doc(db, 'settings', 'general'));
      if (snap.exists()) storeData = snap.data();
    } catch (e) { /* usar defaults */ }

    const tData = {
      cart:             sale.items || [],
      total:            sale.total,
      amountPaid:       sale.amountReceived || sale.total,
      change:           sale.change || 0,
      paymentMethod:    sale.paymentMethod,
      ticketId:         sale.ticketId,
      date:             saleDate.toISOString?.() || saleDate,
      client:           sale.client,
      cashierName:      sale.userName,
      subTotal:         sale.subTotal,
      discountTotal:    sale.discountTotal,
      appliedDiscounts: sale.appliedDiscounts,
    };

    const printed = await printTicketService(tData, storeData);
    if (printed) return;

    // Fallback: usar navegador si el servidor local está desconectado
    const runPrintJob = (footerLabel) => {
      // Renderizar el ticket en un div oculto temporalmente
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;left:-9999px;top:0;width:80mm;background:white;';
      document.body.appendChild(container);

      // Importar ReactDOM dinámicamente para renderizar el TicketInvoice
      import('react-dom/client').then(({ createRoot }) => {
        import('./TicketInvoice').then(({ default: TicketInvoice }) => {
          const root = createRoot(container);
          root.render(
            React.createElement(TicketInvoice, {
              cart:              sale.items || [],
              total:             sale.total,
              amountPaid:        sale.amountReceived || sale.total,
              change:            sale.change || 0,
              paymentMethod:     sale.paymentMethod,
              ticketId:          sale.ticketId,
              date:              saleDate,
              client:            sale.client,
              cashierName:       sale.userName,
              subTotal:          sale.subTotal,
              discountTotal:     sale.discountTotal,
              appliedDiscounts:  sale.appliedDiscounts,
              copyLabel:         '__HIDE_FOOTER__',
            })
          );

          // Esperar render (~800ms) luego abrir ventana de impresión
          setTimeout(() => {
            const win = window.open('', '_blank', 'width=350,height=650,toolbar=no,menubar=no,scrollbars=no');
            if (!win) {
              sileo.warning({ title: 'Habilitá los pop-ups para este sitio en Chrome.' });
              root.unmount();
              document.body.removeChild(container);
              return;
            }

            win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Courier New',monospace; width:80mm; background:white; }
    @page { size:80mm auto; margin:0; }
    .footer-label {
      text-align:center; font-weight:900; font-size:12px;
      text-transform:uppercase; letter-spacing:2px;
      border-top:1px dashed #555; padding-top:6px;
      margin:8px 8px 10px; font-family:'Courier New',monospace;
    }
  </style>
</head>
<body>
  ${container.innerHTML}
  <div class="footer-label">${footerLabel}</div>
</body>
</html>`);
            win.document.close();
            setTimeout(() => {
              win.focus();
              win.print();
              setTimeout(() => win.close(), 500);
            }, 1000);

            root.unmount();
            document.body.removeChild(container);
          }, 800);
        });
      });
    };

    runPrintJob('ORIGINAL — CLIENTE');
    setTimeout(() => {
      runPrintJob('COPIA — TICKET');
    }, 2000);
  };

  const handleVoidSale = async (sale) => {
    setConfirmModal({
      title: `¿Anular venta ${sale.ticketId}?`,
      description: `Total: ₲ ${sale.total.toLocaleString()}. El stock de todos los productos será devuelto automáticamente.`,
      confirmText: 'Sí, anular venta',
      variant: 'void',
      onConfirm: () => _executeVoidSale(sale),
    });
  };

  const _executeVoidSale = async (sale) => {
    setLoading(true);
    try {
      // 1. Marcar venta como cancelada
      await updateDoc(doc(db, 'sales', sale.id), {
        status:     'canceled',
        canceledBy: effectiveUser.name,
        canceledAt: new Date(),
      });

      // 2. Descontar del total del turno (solo si no era fiado, ya que el fiado no sumó al turno)
      const targetShiftId = (sale.shiftId && sale.shiftId !== 'unknown' && sale.shiftId !== 'MANUAL_ENTRY')
        ? sale.shiftId
        : currentShift.id;
      if (sale.paymentMethod !== 'fiado' && targetShiftId) {
        await updateDoc(doc(db, 'shifts', targetShiftId), {
          salesTotal: increment(-sale.total),
        }).catch(() => {});
      }

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

        // Devolver las unidades a los lotes FIFO exactos que se consumieron en la venta
        (item.batchConsumption || []).forEach(({ batchId, qty }) => {
          stockBatch.update(doc(db, 'inventory_batches', batchId), {
            qtyRemaining: increment(parseFloat(qty)),
          });
        });
      }
      await stockBatch.commit();

      sileo.success({ title: 'Venta anulada. Stock devuelto correctamente.' });
      setShowVoidModal(false);
    } catch (error) {
      console.error(error);
      sileo.error({ title: 'Error al anular la venta.' });
    } finally {
      setLoading(false);
    }
  };

  // ─── Apertura de turno ───────────────────────────────────────────────────
  const handleOpenShift = async () => {
    if (!startingCash) return sileo.warning({ title: 'Ingrese el monto inicial de caja.' });
    try {
      const newShift = {
        userId:       effectiveUser.id,
        userName:     effectiveUser.name,
        userRole:     effectiveUser.role,
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
      sileo.error({ title: 'Error al abrir el turno.' });
    }
  };

  // ─── Gastos ──────────────────────────────────────────────────────────────
  const handleAddExpense = async () => {
    if (!expenseData.amount || !expenseData.reason) {
      return sileo.warning({ title: 'Complete el monto y el motivo del gasto.' });
    }
    try {
      await addDoc(collection(db, 'shift_movements'), {
        shiftId: currentShift.id,
        type:    'expense',
        amount:  parseFloat(expenseData.amount),
        reason:  expenseData.reason,
        date:    new Date(),
        user:    effectiveUser.name,
      });
      sileo.success({ title: 'Gasto registrado correctamente.' });
      setShowExpenseModal(false);
      setExpenseData({ amount: '', reason: '' });
    } catch (e) {
      console.error(e);
      sileo.error({ title: 'Error al guardar el gasto.' });
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
      sileo.error({ title: 'Error al calcular el cierre de caja.' });
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
      handleLogout();
    } catch (e) {
      sileo.error({ title: 'Error al cerrar el turno.' });
    }
  };

  // ─── Cálculos del carrito ────────────────────────────────────────────────
  const subTotalAmount = cart.reduce((acc, item) => acc + item.price * (parseFloat(item.quantity) || 0), 0);

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

      const fifoResults = await Promise.all(cart.map(item => resolveFifoCost(db, item)));

      let totalCost = 0;
      const itemsProcessed = cart.map((item, idx) => {
        const cost = fifoResults[idx].cost;
        const qty  = parseFloat(item.quantity || 0);
        totalCost += cost * qty;
        return {
          id:      item.id,
          name:    item.name,
          quantity: item.quantity,
          price:   item.price,
          cost,
          tax:     item.tax || 10,
          soldBy:  item.soldBy,
          batchConsumption: fifoResults[idx].batchConsumption,
        };
      });

      const saleProfit = finalTotalAmount - totalCost;
      const saleData = {
        ticketId,
        userId:           effectiveUser.id,
        userName:         effectiveUser.name,
        shiftId:          currentShift?.id || 'unknown',
        date:             dateObj,
        subTotal:         subTotalAmount,
        discountTotal,
        appliedDiscounts,
        total:            finalTotalAmount,
        paymentMethod:    paymentDetails.method,
        amountReceived:   paymentDetails.method === 'fiado' ? 0 : parseFloat(paymentDetails.amountPaid || finalTotalAmount),
        change:           paymentDetails.change,
        client:           paymentDetails.client || { name: 'SIN NOMBRE', ruc: 'SIN RUC' },
        clientId:         paymentDetails.client?.id || null,
        items:            itemsProcessed,
        status:           'completed',
      };

      // ── Guardar venta ──────────────────────────────────────────────────
      await addDoc(collection(db, 'sales'), saleData);

      // ── Actualizar totales del turno ───────────────────────────────────
      // El fiado no entró como efectivo/digital real a la caja: no suma al
      // Total Vendido del turno hasta que se cobre (ver registerCreditPayment).
      if (currentShift?.id && paymentDetails.method !== 'fiado') {
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

      // Descontar de los lotes FIFO efectivamente consumidos
      itemsProcessed.forEach(item => {
        (item.batchConsumption || []).forEach(({ batchId, qty }) => {
          stockBatch.update(doc(db, 'inventory_batches', batchId), {
            qtyRemaining: increment(-qty),
          });
        });
      });

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
        cashier:          effectiveUser.name,
      };
    } catch (error) {
      console.error(error);
      return { success: false };
    }
  };

  // El stock se actualiza solo: `products` viene de un onSnapshot en tiempo real,
  // que ya refleja la venta. Restarlo acá de nuevo lo descontaba dos veces en pantalla.
  const handleFinalizeSale = () => {
    setCart([]);
    setAppliedDiscounts([]);
    setShowPaymentModal(false);
  };

  // ─── Operaciones del carrito ─────────────────────────────────────────────
  const addToCart = (product) => {
    setCart(prev => {
      const existing        = prev.find(item => item.id === product.id);
      const stockDisponible = parseFloat(product.stock || 0);

      if (existing) {
        if (existing.quantity + 1 > stockDisponible) {
          sileo.warning({ title: '⚠️ Stock insuficiente para agregar más unidades.' });
          return prev;
        }
        return prev.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      if (stockDisponible < 1) {
        sileo.warning({ title: '⚠️ Este producto no tiene stock disponible.' });
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
        sileo.warning({ title: '⚠️ Límite de stock alcanzado.' });
        return item;
      }
      return { ...item, quantity: parseFloat(newQty.toFixed(3)) };
    }));
  };

  const handleQuantityChange = (id, value) => {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    if (value === '') {
      setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: '' } : i));
      return;
    }
    const minQty = item.soldBy === 'weight' ? 0.001 : 1;
    let val = item.soldBy === 'weight' ? parseFloat(value) : parseInt(value);
    if (isNaN(val) || val < minQty) val = minQty;
    if (val > item.stock) {
      sileo.warning({ title: `⚠️ Solo hay ${item.stock} en stock.` });
      val = item.stock;
    }
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
      <div className="h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 flex flex-col items-center justify-center p-4 text-white relative overflow-hidden">
        {/* Decoración de fondo sutil */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <button
          onClick={handleLogout}
          className="absolute top-5 right-5 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-sm font-bold transition-all"
        >
          <LogOut size={18}/> Salir
        </button>

        <div className="bg-slate-900/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl text-center max-w-md w-full border border-slate-700/80 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-emerald-950/50">
            <Clock size={34} className="text-emerald-400"/>
          </div>
          <span className="inline-block text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
            Bodega El Grifo · V2.8
          </span>
          <h2 className="text-2xl font-black mb-1 tracking-tight">
            {effectiveUser?.name ? `¡Hola, ${effectiveUser.name}!` : 'El turno está cerrado'}
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            {hasInventoryAccess ? 'El turno de caja está cerrado. ¿Qué querés hacer?' : 'Abvé tu turno de caja para comenzar a registrar ventas.'}
          </p>
          <button
            onClick={() => setShowOpenModal(true)}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black py-4 rounded-xl mt-2 shadow-lg shadow-emerald-900/50 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
          >
            <ShoppingCart size={20}/> INICIAR CAJA
          </button>

          {hasInventoryAccess && (
            <div className="mt-6 pt-5 border-t border-slate-800 space-y-2.5">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">o acceder directamente a</p>
              {canManageInventorySummarized && (
                <button
                  onClick={() => navigate('/productos')}
                  className="w-full bg-slate-800/90 hover:bg-slate-700 text-slate-200 font-bold py-3.5 rounded-xl border border-slate-700 transition-all hover:scale-[1.01] flex items-center justify-center gap-2 text-sm"
                >
                  <Package size={18} className="text-emerald-400"/> INVENTARIO
                </button>
              )}
              {canCheckCashierInventory && (
                <button
                  onClick={() => navigate('/inventario-cajero')}
                  className="w-full bg-slate-800/90 hover:bg-slate-700 text-slate-200 font-bold py-3.5 rounded-xl border border-slate-700 transition-all hover:scale-[1.01] flex items-center justify-center gap-2 text-sm"
                >
                  <ClipboardCheck size={18} className="text-emerald-400"/> INVENTARIO CAJERO
                </button>
              )}
            </div>
          )}
        </div>

        {showOpenModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-slate-900 w-full max-w-md rounded-2xl p-6 border border-slate-700 shadow-2xl">
              <h3 className="text-xl font-bold mb-1 text-white">Monto inicial en caja</h3>
              <p className="text-xs text-slate-400 mb-4">Ingresá el sencillo disponible para apertura de turno.</p>
              <div className="relative mb-6">
                <span className="absolute left-3.5 top-3.5 text-emerald-400 font-bold text-lg select-none">₲</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={formatGuaranies(startingCash)}
                  onChange={e => setStartingCash(parseGuaraniesStr(e.target.value))}
                  onKeyDown={e => e.key === 'Enter' && handleOpenShift()}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3.5 pl-10 pr-4
                             text-white text-xl font-black font-mono focus:border-emerald-500 focus:outline-none
                             focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="0"
                />
              </div>
              <button
                onClick={handleOpenShift}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-950/50"
              >
                CONFIRMAR APERTURA
              </button>
              <button
                onClick={() => setShowOpenModal(false)}
                className="w-full mt-2.5 text-slate-400 py-2 hover:text-white text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const showOptionsDropdown = canRegisterExpenses || canManageInventorySummarized || canCheckCashierInventory || canManageFiado || canManualFiado;

  // ── INTERFAZ PRINCIPAL ────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans relative">
      
      {/* Banner de sin conexión */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-rose-600 text-white py-2.5 px-4 text-center font-bold text-sm flex items-center justify-center gap-2 z-[9999] shadow-lg select-none">
          <WifiOff size={18} className="animate-pulse" />
          <span>¡Oops! Te has quedado sin conexión. Por favor, verifica tu red.</span>
        </div>
      )}

      {/* Modal de confirmación para acciones destructivas */}
      {confirmModal && (
        <ConfirmModal
          {...confirmModal}
          onClose={() => setConfirmModal(null)}
        />
      )}

      {/* ── MODALES ──────────────────────────────────────────────────────── */}

      {showPaymentModal && (
        <PaymentModal
          total={finalTotalAmount}
          cart={cart}
          onClose={() => setShowPaymentModal(false)}
          onProcessPayment={handleProcessSale}
          onFinalize={handleFinalizeSale}
          allowFiado={canManageFiado}
        />
      )}

      {showCreditModal && (
        <CreditPaymentModal
          onClose={() => setShowCreditModal(false)}
          cashier={effectiveUser}
          shiftId={currentShift?.id}
        />
      )}

      {showManualCreditModal && (
        <ManualDebtModal
          title="Carga Manual de Fiado"
          user={effectiveUser}
          onClose={() => setShowManualCreditModal(false)}
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
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  className="w-full border border-gray-200 p-3 rounded-xl text-lg font-bold
                             focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
                  placeholder="0"
                  value={formatGuaranies(expenseData.amount)}
                  onChange={e => setExpenseData({ ...expenseData, amount: parseGuaraniesStr(e.target.value) })}
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

      {/* Modal de vista previa del ticket */}
      {previewTicketSale && (
        <TicketPreviewModal
          sale={previewTicketSale}
          onClose={() => setPreviewTicketSale(null)}
        />
      )}

      {/* Modal anular venta */}
      {showVoidModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-0 overflow-hidden flex flex-col max-h-[85vh] animate-fadeIn">
            <div className="p-4 bg-rose-50 border-b border-rose-100 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-rose-700 flex items-center gap-2">
                  <Ban size={20}/> Anular Venta
                </h3>
                <p className="text-xs text-rose-500 font-medium">
                  Ventas realizadas en el día ({recentSales.length} tickets)
                </p>
              </div>
              <button onClick={() => setShowVoidModal(false)} className="p-1 hover:bg-rose-100 rounded-full">
                <X size={20} className="text-rose-400"/>
              </button>
            </div>
            <div className="p-4 border-b border-gray-100 bg-white">
              <div className="relative">
                <Search className="absolute left-3 top-3 text-gray-400" size={16}/>
                <input
                  type="text"
                  placeholder="Buscar por Nro Ticket, producto o cliente..."
                  value={voidSearch}
                  onChange={e => setVoidSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm
                             bg-gray-50 focus:bg-white focus:outline-none focus:border-rose-300 transition-all"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {recentSales.filter(s => matchesSaleSearch(s, voidSearch)).length === 0 ? (
                <div className="text-center text-gray-400 py-8 text-sm flex flex-col items-center">
                  <Ban size={32} className="mb-2 opacity-20"/>
                  No se encontraron ventas en el día.
                </div>
              ) : (
                recentSales
                  .filter(s => matchesSaleSearch(s, voidSearch))
                  .map(sale => (
                    <div key={sale.id} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center gap-3 hover:shadow-md transition-shadow">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-gray-800 text-sm">{sale.ticketId}</p>
                          {sale.client?.name && sale.client.name !== 'SIN NOMBRE' && (
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                              {sale.client.name}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <Clock size={10}/>
                          {formatTime(new Date(sale.date?.toDate ? sale.date.toDate() : sale.date))}
                          {' • '}{sale.items?.length || 0} items
                        </p>
                        {sale.items?.length > 0 && (
                          <p className="text-[11px] text-gray-400 truncate mt-0.5">
                            {sale.items.map(i => `${i.quantity}× ${i.name}`).join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex items-center gap-2 shrink-0">
                        <span className="font-bold text-gray-800 text-sm">₲ {sale.total.toLocaleString()}</span>
                        <button
                          onClick={() => setPreviewTicketSale(sale)}
                          className="bg-slate-50 text-slate-600 p-2 rounded-lg hover:bg-slate-100 hover:text-slate-800 transition-colors border border-slate-200"
                          title="Ver detalle del ticket"
                        >
                          <Receipt size={17}/>
                        </button>
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
            <div className="p-3 bg-rose-50/50 text-[10px] text-rose-500 text-center font-medium border-t border-rose-100">
              Se muestran todas las ventas realizadas en el día ({recentSales.length} tickets).
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Reimprimir Ticket ─────────────────────────────────────── */}
      {showReprintModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-0 overflow-hidden flex flex-col max-h-[85vh] animate-fadeIn">

            <div className="p-4 bg-blue-50 border-b border-blue-100 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-blue-700 flex items-center gap-2">
                  <PrinterCheck size={20}/> Tickets del Día / Reimprimir
                </h3>
                <p className="text-xs text-blue-500 font-medium">
                  Ventas realizadas en el día ({reprintSales.length} tickets)
                </p>
              </div>
              <button onClick={() => setShowReprintModal(false)} className="p-1 hover:bg-blue-100 rounded-full">
                <X size={20} className="text-blue-400"/>
              </button>
            </div>

            <div className="p-4 border-b border-gray-100 bg-white">
              <div className="relative">
                <Search className="absolute left-3 top-3 text-gray-400" size={16}/>
                <input
                  type="text"
                  placeholder="Buscar por Nro Ticket, producto o cliente..."
                  value={reprintSearch}
                  onChange={e => setReprintSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm
                             bg-gray-50 focus:bg-white focus:outline-none focus:border-blue-300 transition-all"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {reprintSales
                .filter(s => matchesSaleSearch(s, reprintSearch))
                .length === 0 ? (
                <div className="text-center text-gray-400 py-8 text-sm flex flex-col items-center">
                  <PrinterCheck size={32} className="mb-2 opacity-20"/>
                  No se encontraron ventas en el día.
                </div>
              ) : (
                reprintSales
                  .filter(s => matchesSaleSearch(s, reprintSearch))
                  .map(sale => (
                    <div key={sale.id} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2 gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-gray-800 text-sm">{sale.ticketId}</p>
                            {sale.client?.name && sale.client.name !== 'SIN NOMBRE' && (
                              <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                                {sale.client.name}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <Clock size={10}/>
                            {formatTime(sale.dateObj)}
                            {' • '}{sale.items?.length || 0} items
                            {' • '}₲ {sale.total?.toLocaleString()}
                          </p>
                          {sale.items?.length > 0 && (
                            <p className="text-[11px] text-gray-400 truncate mt-0.5">
                              {sale.items.map(i => `${i.quantity}× ${i.name}`).join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPreviewTicketSale(sale)}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 rounded-lg transition-colors"
                        >
                          <Receipt size={15}/> Ver Ticket
                        </button>
                        <button
                          onClick={() => handleReprint(sale)}
                          className="flex-1 flex items-center justify-center gap-2 bg-gray-900 hover:bg-black text-white text-xs font-bold py-2.5 rounded-lg transition-colors"
                        >
                          <Printer size={15}/> Reimprimir
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>

            <div className="p-3 bg-blue-50/50 text-[10px] text-blue-500 text-center font-medium border-t border-blue-100">
              Se muestran todas las ventas realizadas en el día ({reprintSales.length} tickets).
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
      <div className="flex-1 flex flex-col min-w-0 bg-slate-100/80">

        {/* HEADER */}
        <div className="bg-white/95 backdrop-blur-md h-20 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.04)] border-b border-slate-200/80 flex items-center justify-between px-6 shrink-0 gap-5 z-20 sticky top-0">
          <div className="flex items-center gap-3.5 shrink-0">
            <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 p-2.5 rounded-2xl text-white shadow-lg shadow-emerald-600/25 ring-2 ring-emerald-500/15">
              <Store size={24} strokeWidth={2.4}/>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none">
                  Bodega <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">El Grifo</span>
                </h1>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                  V2.8
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                Terminal Punto de Venta
              </p>
            </div>
          </div>

          {/* BUSCADOR */}
          <div className="relative flex-1 max-w-2xl group">
            <Search className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-emerald-600 transition-colors" size={19}/>
            <input
              type="text"
              placeholder="Buscar producto por nombre, código o escanear..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={handleScannerInput}
              autoFocus
              className="w-full pl-11 pr-24 py-3 bg-slate-100/90 border border-slate-200/90 focus:bg-white
                         focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 rounded-2xl
                         outline-none transition-all text-sm font-semibold text-slate-700 placeholder:text-slate-400 placeholder:font-medium shadow-inner"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2.5 p-1 rounded-lg bg-slate-200/80 hover:bg-slate-300 text-slate-600 transition-colors"
                title="Limpiar búsqueda"
              >
                <X size={15}/>
              </button>
            ) : (
              <div className="hidden sm:flex items-center gap-1 absolute right-3.5 top-3 px-2 py-1 rounded-lg bg-white border border-slate-200/80 text-[10px] font-bold text-slate-400 select-none pointer-events-none">
                <Barcode size={12} className="text-emerald-600"/> Lector
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Tarjeta de perfil de cajero activo */}
            <div className="hidden xl:flex items-center gap-2.5 bg-slate-50 border border-slate-200/80 pl-2.5 pr-3.5 py-1.5 rounded-2xl">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-black text-xs flex items-center justify-center shadow-sm uppercase">
                {(effectiveUser?.name || 'C').slice(0, 2)}
              </div>
              <div className="text-left leading-tight">
                <p className="text-xs font-extrabold text-slate-800 truncate max-w-[120px]">{effectiveUser?.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>
                  <p className="text-[9px] text-emerald-600 font-black uppercase tracking-wider">Turno Abierto</p>
                </div>
              </div>
            </div>

            {showOptionsDropdown && (
              <div className="relative">
                <button
                  onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all font-bold text-sm border shadow-sm active:scale-95 ${
                    showOptionsMenu
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <MoreVertical size={18}/> <span className="hidden lg:inline">Opciones</span>
                </button>

                {showOptionsMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowOptionsMenu(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50 animate-fadeIn ring-1 ring-black/5 p-1.5 space-y-0.5">
                      {canRegisterExpenses && (
                        <button
                          onClick={() => { setShowExpenseModal(true); setShowOptionsMenu(false); }}
                          className="w-full text-left px-3.5 py-2.5 rounded-xl hover:bg-rose-50 text-rose-600 font-bold text-sm flex items-center gap-3 transition-colors"
                        >
                          <div className="bg-rose-100 p-1.5 rounded-lg"><TrendingDown size={16}/></div>
                          Registrar Gasto
                        </button>
                      )}
                      {canRegisterExpenses && (
                        <button
                          onClick={fetchRecentSales}
                          className="w-full text-left px-3.5 py-2.5 rounded-xl hover:bg-slate-100 text-slate-700 font-bold text-sm flex items-center gap-3 transition-colors"
                        >
                          <div className="bg-slate-100 p-1.5 rounded-lg"><Ban size={16}/></div>
                          Anular Venta
                        </button>
                      )}
                      {canRegisterExpenses && (
                        <button
                          onClick={fetchReprintSales}
                          className="w-full text-left px-3.5 py-2.5 rounded-xl hover:bg-blue-50 text-blue-600 font-bold text-sm flex items-center gap-3 transition-colors"
                        >
                          <div className="bg-blue-100 p-1.5 rounded-lg"><PrinterCheck size={16}/></div>
                          Reimprimir Ticket
                        </button>
                      )}
                      {canManageInventorySummarized && (
                        <button
                          onClick={() => { navigate('/productos'); setShowOptionsMenu(false); }}
                          className="w-full text-left px-3.5 py-2.5 rounded-xl hover:bg-emerald-50 text-emerald-600 font-bold text-sm flex items-center gap-3 transition-colors"
                        >
                          <div className="bg-emerald-100 p-1.5 rounded-lg"><Package size={16}/></div>
                          Ver Inventario
                        </button>
                      )}
                      {canCheckCashierInventory && (
                        <button
                          onClick={() => { navigate('/inventario-cajero'); setShowOptionsMenu(false); }}
                          className="w-full text-left px-3.5 py-2.5 rounded-xl hover:bg-emerald-50 text-emerald-600 font-bold text-sm flex items-center gap-3 transition-colors"
                        >
                          <div className="bg-emerald-100 p-1.5 rounded-lg"><ClipboardCheck size={16}/></div>
                          Inventario Cajero
                        </button>
                      )}
                      {canManageFiado && (
                        <button
                          onClick={() => { setShowCreditModal(true); setShowOptionsMenu(false); }}
                          className="w-full text-left px-3.5 py-2.5 rounded-xl hover:bg-amber-50 text-amber-700 font-bold text-sm flex items-center gap-3 transition-colors"
                        >
                          <div className="bg-amber-100 p-1.5 rounded-lg"><HandCoins size={16}/></div>
                          Cobrar Fiado
                        </button>
                      )}
                      {canManualFiado && (
                        <button
                          onClick={() => { setShowManualCreditModal(true); setShowOptionsMenu(false); }}
                          className="w-full text-left px-3.5 py-2.5 rounded-xl hover:bg-amber-50 text-amber-700 font-bold text-sm flex items-center gap-3 transition-colors"
                        >
                          <div className="bg-amber-100 p-1.5 rounded-lg"><BookOpen size={16}/></div>
                          Carga Manual de Fiado
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            <button
              onClick={prepareCloseShift}
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 text-rose-600 rounded-xl
                         hover:bg-rose-600 hover:text-white transition-all font-bold text-sm border border-rose-200/80
                         shadow-sm active:scale-95"
            >
              <LogOut size={18}/> <span className="hidden lg:inline">Cerrar Caja</span>
            </button>
          </div>
        </div>

        {/* BARRA CATEGORÍAS */}
        <div className="h-16 bg-white/90 backdrop-blur-md border-b border-slate-200/80 flex items-center px-6 gap-2.5 overflow-x-auto shrink-0 scrollbar-hide z-10 sticky top-20">
          <div className="shrink-0 flex items-center scale-90 origin-left">
            <WeatherWidget/>
          </div>
          <div className="h-7 w-px bg-slate-200 mx-1.5 shrink-0"/>
          {categories.map(cat => {
            const isSelected = selectedCategory === cat;
            const catCount = cat === 'Todas'
              ? products.length
              : products.filter(p => p.category === cat).length;

            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all duration-200 active:scale-95 flex items-center gap-2 shrink-0
                  ${isSelected
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/25 ring-2 ring-emerald-500/20'
                    : 'bg-slate-50/90 text-slate-600 border border-slate-200/90 hover:bg-white hover:border-emerald-300 hover:text-emerald-700 hover:shadow-sm'}`}
              >
                <span>{cat}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-black ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-200/70 text-slate-500'
                }`}>
                  {catCount}
                </span>
              </button>
            );
          })}
        </div>

        {/* GRID DE PRODUCTOS */}
        <div className="flex-1 p-6 overflow-y-auto bg-gradient-to-b from-slate-100/70 to-slate-200/40 custom-scrollbar">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-20">
              <div className="w-20 h-20 rounded-3xl bg-white shadow-sm border border-slate-200/80 flex items-center justify-center mb-4">
                <Package size={38} className="text-slate-300"/>
              </div>
              <p className="font-extrabold text-slate-600 text-base">No se encontraron productos</p>
              <p className="text-xs text-slate-400 mt-1">Probá con otro nombre, código o cambiá de categoría.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 pb-20">
              {filteredProducts.map((product, idx) => {
                const stockVal     = parseFloat(product.stock);
                const minVal       = parseFloat(product.low_stock);
                const isOutOfStock = stockVal <= 0;
                const isLowStock   = !isOutOfStock && stockVal <= minVal;
                const cartItem     = cart.find(i => i.id === product.id);

                return (
                  <div
                    key={idx}
                    onClick={() => addToCart(product)}
                    className={`group relative rounded-2xl p-4 flex flex-col justify-between h-48 overflow-hidden transition-all duration-200 select-none
                      ${isOutOfStock
                        ? 'bg-white/60 opacity-60 cursor-not-allowed border border-slate-200/70'
                        : cartItem
                          ? 'bg-gradient-to-b from-white to-emerald-50/40 cursor-pointer shadow-md hover:shadow-xl hover:-translate-y-1 border-2 border-emerald-500 ring-4 ring-emerald-500/10'
                          : 'bg-white cursor-pointer shadow-sm hover:shadow-xl hover:border-emerald-400/70 hover:-translate-y-1 border border-slate-200/80'}`}
                  >
                    {/* Barra superior de acento */}
                    <div
                      className={`absolute top-0 left-0 w-full h-1.5 transition-colors ${!isOutOfStock && 'group-hover:bg-emerald-500'}`}
                      style={{ backgroundColor: isOutOfStock ? '#cbd5e1' : (product.color || '#10b981') }}
                    />

                    {/* Fila superior: Categoría/Cantidad en carrito + Stock */}
                    <div className="flex items-center justify-between gap-1.5 pt-1">
                      {cartItem ? (
                        <span className="bg-emerald-600 text-white text-[11px] font-black px-2.5 py-0.5 rounded-lg shadow-sm flex items-center gap-1">
                          ×{cartItem.quantity} en ticket
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate max-w-[95px]">
                          {product.category || 'General'}
                        </span>
                      )}

                      <div className={`text-[10px] font-black px-2 py-0.5 rounded-lg border flex items-center gap-1 shrink-0
                        ${isOutOfStock
                          ? 'bg-slate-100 text-slate-500 border-slate-200'
                          : isLowStock
                            ? 'bg-rose-50 text-rose-600 border-rose-200/80'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200/70'}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          isOutOfStock ? 'bg-slate-400' : isLowStock ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'
                        }`}/>
                        {isOutOfStock
                          ? 'Sin stock'
                          : product.soldBy === 'weight'
                            ? parseFloat(product.stock).toFixed(2) + ' kg'
                            : product.stock + ' u.'}
                      </div>
                    </div>

                    {/* Centro: Nombre y código */}
                    <div className="my-auto py-1">
                      <h3 className={`font-extrabold text-sm leading-snug line-clamp-2 transition-colors ${
                        isOutOfStock ? 'text-slate-400' : 'text-slate-800 group-hover:text-emerald-700'
                      }`}>
                        {product.name}
                      </h3>
                      {product.sku && (
                        <p className="text-[10px] text-slate-400 flex items-center gap-1 font-mono mt-1">
                          <Barcode size={11} className="text-slate-300"/> {product.sku}
                        </p>
                      )}
                    </div>

                    {/* Pie de tarjeta: Precio + Botón rápido visual */}
                    <div className="pt-2 border-t border-slate-100 flex items-end justify-between gap-2">
                      <div>
                        <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-none mb-0.5">
                          Precio
                        </span>
                        <span className={`block font-black text-xl tracking-tight leading-none ${
                          isOutOfStock ? 'text-slate-400' : 'text-emerald-600'
                        }`}>
                          ₲ {product.price?.toLocaleString()}
                        </span>
                      </div>

                      {!isOutOfStock && (
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all shrink-0 ${
                          cartItem
                            ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                            : 'bg-slate-100 text-slate-500 group-hover:bg-emerald-600 group-hover:text-white group-hover:shadow-sm'
                        }`}>
                          <Plus size={16} strokeWidth={2.8}/>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── CARRITO (SIDEBAR DERECHO) ──────────────────────────────────── */}
      <div className="w-96 bg-white border-l border-slate-200/90 flex flex-col shadow-2xl z-30 h-full">

        {/* Cart Header */}
        <div className="h-20 flex items-center justify-between px-6 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-md shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
              <ShoppingCart size={20}/>
            </div>
            <div>
              <h2 className="font-black text-base tracking-tight leading-none">Ticket de Venta</h2>
              <p className="text-[10px] text-slate-400 font-semibold mt-1">
                {cart.length === 0 ? 'Esperando productos...' : 'Detalle de compra actual'}
              </p>
            </div>
          </div>
          <div className="text-xs font-black bg-emerald-500/15 text-emerald-300 px-3 py-1.5 rounded-xl border border-emerald-500/30">
            {cart.length} {cart.length === 1 ? 'Ítem' : 'Ítems'}
          </div>
        </div>

        {/* Items del carrito */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-slate-50/70 custom-scrollbar">
          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 py-10 px-6">
              <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-center mb-3 text-slate-300">
                <ShoppingCart size={30} />
              </div>
              <p className="text-sm font-extrabold text-slate-500">El carrito está vacío</p>
              <p className="text-xs text-slate-400 mt-1 text-center leading-relaxed">
                Tocá cualquier producto del catálogo o escaneá su código de barras para agregarlo al ticket.
              </p>
            </div>
          )}
          {cart.map(item => (
            <div key={item.id} className="flex gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md hover:border-emerald-200 transition-all group">
              <div className="flex flex-col items-center justify-between bg-slate-50 rounded-xl w-10 py-1 border border-slate-200/90 shrink-0">
                <button
                  onClick={() => updateQuantity(item.id, 1)}
                  className="w-full flex items-center justify-center text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg p-1 transition-colors"
                >
                  <Plus size={13} strokeWidth={2.5}/>
                </button>
                <input
                  type="number"
                  step={item.soldBy === 'weight' ? '0.001' : '1'}
                  min={item.soldBy === 'weight' ? '0.001' : '1'}
                  value={item.quantity}
                  onChange={e => handleQuantityChange(item.id, e.target.value)}
                  onBlur={() => {
                    const minQty = item.soldBy === 'weight' ? 0.001 : 1;
                    if (!item.quantity || item.quantity < minQty) {
                      handleQuantityChange(item.id, minQty);
                    }
                  }}
                  className="w-full text-center bg-transparent font-black text-xs focus:outline-none p-0 appearance-none text-slate-800"
                />
                <button
                  onClick={() => updateQuantity(item.id, -1)}
                  className="w-full flex items-center justify-center text-slate-500 hover:text-rose-500 hover:bg-rose-50 rounded-lg p-1 transition-colors"
                >
                  <Minus size={13} strokeWidth={2.5}/>
                </button>
              </div>
              <div className="flex-1 py-0.5 min-w-0">
                <p className="text-xs font-extrabold text-slate-800 line-clamp-2 leading-snug">{item.name}</p>
                <p className="text-[11px] text-slate-400 font-semibold mt-1">
                  ₲ {item.price.toLocaleString()} {item.soldBy === 'weight' ? '/ kg' : 'c/u'}
                </p>
              </div>
              <div className="text-right flex flex-col justify-between items-end py-0.5 shrink-0">
                <p className="text-sm font-black text-slate-900">
                  ₲ {(item.price * (parseFloat(item.quantity) || 0)).toLocaleString()}
                </p>
                <button
                  onClick={() => removeFromCart(item.id)}
                  className="text-slate-300 hover:text-rose-500 transition-colors p-1 rounded-lg hover:bg-rose-50"
                  title="Quitar del ticket"
                >
                  <Trash2 size={15}/>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Cart Footer */}
        <div className="p-5 bg-white border-t border-slate-200/90 shadow-[0_-10px_30px_rgba(15,23,42,0.04)] z-20">

          {/* Descuentos */}
          <div className="mb-3.5">
            <button
              onClick={() => setShowDiscountModal(true)}
              className={`w-full text-xs font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 border border-dashed
                ${appliedDiscounts.length > 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-emerald-50/50 hover:text-emerald-700 hover:border-emerald-300'}`}
            >
              <Tag size={15}/> {appliedDiscounts.length > 0 ? 'Editar Promos Aplicadas' : 'Aplicar Descuento / Promo'}
            </button>

            {appliedDiscounts.length > 0 && (
              <div className="mt-2 space-y-1 bg-emerald-50/80 p-2.5 rounded-xl border border-emerald-200/70 text-[11px]">
                {appliedDiscounts.map(d => (
                  <div key={d.id} className="flex justify-between font-bold text-emerald-800">
                    <span>{d.quantity}× {d.name}</span>
                    <span>− ₲ {(d.type === 'fixed'
                      ? d.value * d.quantity
                      : (subTotalAmount * (d.value / 100)) * d.quantity
                    ).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Totales en bloque destacado */}
          <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 mb-4 space-y-1.5">
            <div className="flex justify-between text-slate-500 text-xs font-bold">
              <span>Subtotal</span>
              <span>₲ {subTotalAmount.toLocaleString()}</span>
            </div>

            {discountTotal > 0 && (
              <div className="flex justify-between text-emerald-600 font-bold text-xs">
                <span>Descuento</span>
                <span>− ₲ {discountTotal.toLocaleString()}</span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200/80 flex justify-between items-baseline">
              <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Total a Pagar</span>
              <span className="text-3xl font-black text-emerald-600 tracking-tight">
                ₲ {finalTotalAmount.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Botones acción */}
          <div className="grid grid-cols-4 gap-2.5">
            <button
              onClick={() => setConfirmModal({
                    title: '¿Vaciar el carrito?',
                    description: 'Se eliminarán todos los productos agregados.',
                    confirmText: 'Sí, vaciar',
                    variant: 'warning',
                    onConfirm: () => { setCart([]); setAppliedDiscounts([]); },
                  })}
              disabled={cart.length === 0}
              title="Vaciar carrito"
              className="col-span-1 flex items-center justify-center p-3.5 rounded-xl border-2 border-slate-200/80 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 transition-all"
            >
              <Trash2 size={20}/>
            </button>
            <button
              onClick={() => setShowPaymentModal(true)}
              disabled={cart.length === 0}
              className="col-span-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black py-3.5 rounded-xl shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 disabled:opacity-40 disabled:shadow-none active:scale-95 transition-all text-base tracking-wide"
            >
              <CreditCard size={20}/> COBRAR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}