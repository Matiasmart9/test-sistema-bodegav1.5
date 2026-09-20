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
