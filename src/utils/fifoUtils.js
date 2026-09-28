// src/utils/fifoUtils.js
// Costeo FIFO por lotes, compartido entre PosTerminal, Registro Manual de Ventas
// y los ajustes de stock de ProductHistory.
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

// Arma el plan de descuento FIFO (lotes más antiguos primero) para sacar `qty`
// unidades sin costeo de venta. `restored` ({ [batchId]: qty }) suma de vuelta
// unidades que otra operación de la misma transacción está devolviendo.
export async function planBatchConsumption(productId, variantIndex, qty, restored = {}) {
  const snap = await getDocs(query(
    collection(db, 'inventory_batches'),
    where('productId', '==', productId),
    where('variantIndex', '==', variantIndex >= 0 ? variantIndex : null)
  ));

  const batches = snap.docs
    .map(d => ({
      id: d.id,
      ...d.data(),
      available: (parseFloat(d.data().qtyRemaining) || 0) + (restored[d.id] || 0),
    }))
    .filter(b => b.available > 0)
    .sort((a, b) => {
      const da = a.entryDate?.toDate ? a.entryDate.toDate() : new Date(a.entryDate);
      const db_ = b.entryDate?.toDate ? b.entryDate.toDate() : new Date(b.entryDate);
      return da - db_;
    });

  let remaining = qty;
  const plan = [];
  for (const b of batches) {
    if (remaining <= 0) break;
    const take = Math.min(b.available, remaining);
    plan.push({ batchId: b.id, qty: take });
    remaining -= take;
  }
  return plan;
}

/**
 * Consume el stock de los lotes de compra más antiguos primero y devuelve
 * el costo real ponderado de un ítem vendido + qué lotes se descontaron
 * (para poder revertirlos exactamente si la venta se anula).
 *
 * item necesita: originalId, isVariant, variantIndex, quantity, cost (de referencia, por si no hay lotes).
 */
export async function resolveFifoCost(db, item) {
  const qtyNeeded    = parseFloat(item.quantity) || 0;
  const fallbackCost = parseFloat(item.cost || 0);

  const q = query(
    collection(db, 'inventory_batches'),
    where('productId', '==', item.originalId),
    where('variantIndex', '==', item.isVariant ? item.variantIndex : null)
  );
  const snap = await getDocs(q);
  const batches = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(b => parseFloat(b.qtyRemaining || 0) > 0)
    .sort((a, b) => {
      const da = a.entryDate?.toDate ? a.entryDate.toDate() : new Date(a.entryDate);
      const dbb = b.entryDate?.toDate ? b.entryDate.toDate() : new Date(b.entryDate);
      return da - dbb;
    });

  let remaining = qtyNeeded;
  let costAccum = 0;
  const batchConsumption = [];

  for (const b of batches) {
    if (remaining <= 0) break;
    const take = Math.min(parseFloat(b.qtyRemaining || 0), remaining);
    if (take <= 0) continue;
    costAccum += take * parseFloat(b.unitCost || 0);
    batchConsumption.push({ batchId: b.id, qty: take });
    remaining -= take;
  }

  // Sin lotes suficientes (stock heredado de antes de esta función) —
  // el resto se costea con el costo de referencia del producto.
  if (remaining > 0) costAccum += remaining * fallbackCost;

  return {
    cost: qtyNeeded > 0 ? costAccum / qtyNeeded : 0,
    batchConsumption,
  };
}
