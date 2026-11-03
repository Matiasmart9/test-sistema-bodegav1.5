// src/utils/creditUtils.js
// Lógica compartida del sistema de Fiado (ventas a crédito).
import { collection, query, where, getDocs, addDoc, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Trae el resumen de crédito de un cliente: ventas fiadas (no anuladas),
 * deudas cargadas a mano (no anuladas), pagos activos, y el saldo pendiente
 * = (ventas + deudas manuales) - pagos.
 * También devuelve el detalle ordenado por fecha (más reciente primero)
 * para armar el historial completo, incluyendo el desglose de productos
 * pagados, parciales y pendientes de cada ticket.
 */
export async function fetchClientCredit(clientId) {
  const salesQ = query(
    collection(db, 'sales'),
    where('clientId', '==', clientId),
    where('paymentMethod', '==', 'fiado')
  );
  const paymentsQ = query(
    collection(db, 'credit_payments'),
    where('clientId', '==', clientId)
  );
  const chargesQ = query(
    collection(db, 'credit_charges'),
    where('clientId', '==', clientId)
  );

  const [salesSnap, paymentsSnap, chargesSnap] = await Promise.all([
    getDocs(salesQ), getDocs(paymentsQ), getDocs(chargesQ),
  ]);

  const toDateObj = (x) => ({ ...x, dateObj: x.date?.toDate ? x.date.toDate() : new Date(x.date) });

  const sales = salesSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(s => s.status !== 'canceled')
    .map(toDateObj)
    .sort((a, b) => b.dateObj - a.dateObj);

  const payments = paymentsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .map(toDateObj)
    .sort((a, b) => b.dateObj - a.dateObj);

  const charges = chargesSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .map(toDateObj)
    .sort((a, b) => b.dateObj - a.dateObj);

  const totalSales   = sales.reduce((acc, s) => acc + (parseFloat(s.total) || 0), 0);
  const totalCharges = charges
    .filter(c => c.status !== 'voided')
    .reduce((acc, c) => acc + (parseFloat(c.amount) || 0), 0);
  const totalSold = totalSales + totalCharges;
  const totalPaid = payments
    .filter(p => p.status !== 'voided')
    .reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);

  const enrichedSales = computeCreditAllocation(sales, charges, totalPaid);

  return {
    sales: enrichedSales,
    payments,
    charges,
    totalSold,
    totalPaid,
    balance: totalSold - totalPaid,
  };
}

/**
 * Calcula los importes efectivos de cada ítem dentro de una venta fiada,
 * ajustando descuentos del ticket para que la suma de importes efectivos
 * coincida exactamente con el total del ticket.
 */
export function computeSaleItemAmounts(sale) {
  const rawItems = Array.isArray(sale?.items) ? sale.items : [];
  const saleTotal = Math.round(parseFloat(sale?.total) || 0);

  const lines = rawItems.map((item, idx) => {
    const qty = parseFloat(item.quantity) || 1;
    const price = parseFloat(item.price) || 0;
    const rawLine = Math.round(price * qty);
    return {
      ...item,
      idx,
      rawLine,
      effectiveLine: rawLine,
      discountApplied: 0,
    };
  });

  const sumRaw = lines.reduce((acc, l) => acc + l.rawLine, 0);
  let diff = sumRaw - saleTotal; // positivo si hay descuento en el ticket

  if (diff > 0 && lines.length > 0) {
    // Descontar primero del ítem de mayor valor para que los productos chicos
    // conserven su precio nominal reconocible por el cliente.
    const byLargest = [...lines].sort((a, b) => b.effectiveLine - a.effectiveLine);
    for (const line of byLargest) {
      if (diff <= 0) break;
      const cut = Math.min(diff, line.effectiveLine);
      line.effectiveLine -= cut;
      line.discountApplied += cut;
      diff -= cut;
    }
  } else if (diff < 0 && lines.length > 0) {
    lines[0].effectiveLine += Math.abs(diff);
  }

  return lines;
}

/**
 * Distribuye el total pagado por el cliente (`totalPaid`) entre sus deudas
 * (ventas fiadas y cargos manuales activos) y determina en cada ticket qué
 * productos están PAGADOS, cuáles tienen PAGO PARCIAL y cuáles están PENDIENTES.
 *
 * Reglas dentro de cada ticket:
 * 1. Primero se cubren los productos marcados manualmente por el cajero/admin (`paidItemIndices`).
 * 2. Con el saldo pagado restante del ticket, se cubren en orden los productos cuyo importe
 *    entre completo en el monto disponible (así, si un ticket de 58.500 tiene Fernet 50.000,
 *    Yerba 6.500 y Yogulac 4.000 y el cliente entrega 30.000 o 45.000, reconoce Yerba y Yogulac
 *    como PAGADOS y aplica el resto como PAGO PARCIAL al Fernet).
 * 3. Cualquier resto que no alcance a completar otro producto se aplica como PAGO PARCIAL
 *    al primer producto pendiente.
 */
export function computeCreditAllocation(sales = [], charges = [], totalPaid = 0) {
  let pool = Math.max(0, Math.round(parseFloat(totalPaid) || 0));

  const activeCharges = (charges || [])
    .filter(c => c.status !== 'voided')
    .map(c => ({
      _kind: 'charge',
      id: c.id,
      dateObj: c.dateObj || (c.date?.toDate ? c.date.toDate() : new Date(c.date)),
      totalAmount: Math.round(parseFloat(c.amount) || 0),
      allocated: 0,
    }));

  const saleTrackers = (sales || []).map(s => {
    const itemLines = computeSaleItemAmounts(s);
    const paidIndices = Array.isArray(s.paidItemIndices) ? s.paidItemIndices : [];
    const manualRequired = itemLines
      .filter(l => paidIndices.includes(l.idx))
      .reduce((acc, l) => acc + l.effectiveLine, 0);

    return {
      _kind: 'sale',
      id: s.id,
      sale: s,
      itemLines,
      paidIndices,
      dateObj: s.dateObj || (s.date?.toDate ? s.date.toDate() : new Date(s.date)),
      totalAmount: Math.round(parseFloat(s.total) || 0),
      manualRequired,
      allocated: 0,
    };
  });

  // Paso 1: Priorizar monto para ítems marcados manualmente (del ticket más antiguo al más nuevo)
  const salesOldestFirst = [...saleTrackers].sort((a, b) => a.dateObj - b.dateObj);
  for (const st of salesOldestFirst) {
    if (pool <= 0) break;
    if (st.manualRequired > 0) {
      const give = Math.min(pool, st.manualRequired, st.totalAmount);
      st.allocated += give;
      pool -= give;
    }
  }

  // Paso 2: Distribuir el resto del pool cronológicamente (deuda más antigua primero)
  const allDebtsOldestFirst = [...saleTrackers, ...activeCharges].sort((a, b) => a.dateObj - b.dateObj);
  for (const debt of allDebtsOldestFirst) {
    if (pool <= 0) break;
    const room = Math.max(0, debt.totalAmount - debt.allocated);
    if (room > 0) {
      const give = Math.min(pool, room);
      debt.allocated += give;
      pool -= give;
    }
  }

  // Paso 3: Calcular el detalle por producto para cada venta
  const trackerById = {};
  for (const st of saleTrackers) {
    const ticketPaid = Math.min(st.totalAmount, st.allocated);
    const ticketPending = Math.max(0, st.totalAmount - ticketPaid);
    let avail = ticketPaid;

    const paidSet = new Set(st.paidIndices);
    const itemsResult = st.itemLines.map(l => ({
      ...l,
      manuallyMarked: paidSet.has(l.idx),
      status: 'pending', // 'paid' | 'partial' | 'pending'
      paidAmount: 0,
      pendingAmount: l.effectiveLine,
      unitsPaid: 0,
    }));

    if (ticketPaid >= st.totalAmount && st.totalAmount > 0) {
      itemsResult.forEach(it => {
        it.status = 'paid';
        it.paidAmount = it.effectiveLine;
        it.pendingAmount = 0;
        it.unitsPaid = parseFloat(it.quantity) || 1;
      });
    } else {
      // 3a. Cubrir primero los productos marcados manualmente
      for (const it of itemsResult) {
        if (!it.manuallyMarked) continue;
        if (avail >= it.effectiveLine && it.effectiveLine > 0) {
          it.status = 'paid';
          it.paidAmount = it.effectiveLine;
          it.pendingAmount = 0;
          avail -= it.effectiveLine;
        } else if (avail > 0) {
          it.status = 'partial';
          it.paidAmount = avail;
          it.pendingAmount = it.effectiveLine - avail;
          avail = 0;
        }
      }

      // 3b. Cubrir productos no marcados que entren completos en el monto disponible
      for (const it of itemsResult) {
        if (it.status !== 'pending') continue;
        if (avail > 0 && it.effectiveLine > 0 && it.effectiveLine <= avail) {
          it.status = 'paid';
          it.paidAmount = it.effectiveLine;
          it.pendingAmount = 0;
          avail -= it.effectiveLine;
        }
      }

      // 3c. Si todavía queda saldo pagado a cuenta, aplicarlo como pago parcial al siguiente pendiente
      for (const it of itemsResult) {
        if (it.status !== 'pending' || avail <= 0) continue;
        const give = Math.min(avail, it.effectiveLine);
        if (give > 0) {
          it.paidAmount = give;
          it.pendingAmount = it.effectiveLine - give;
          it.status = it.pendingAmount === 0 ? 'paid' : 'partial';
          avail -= give;
        }
      }

      // Calcular unidades cubiertas cuando cantidad > 1
      itemsResult.forEach(it => {
        const qty = parseFloat(it.quantity) || 1;
        const unitPrice = parseFloat(it.price) || 0;
        if (it.status === 'paid') {
          it.unitsPaid = qty;
        } else if (it.status === 'partial' && qty > 1 && it.soldBy !== 'weight' && unitPrice > 0) {
          it.unitsPaid = Math.min(qty, Math.floor(it.paidAmount / unitPrice));
        } else {
          it.unitsPaid = 0;
        }
      });
    }

    trackerById[st.id] = {
      ...st.sale,
      creditStatus: {
        status: ticketPending === 0 && st.totalAmount > 0
          ? 'paid'
          : ticketPaid > 0
            ? 'partial'
            : 'pending',
        paidAmount: ticketPaid,
        pendingAmount: ticketPending,
        items: itemsResult,
      },
    };
  }

  return (sales || []).map(s => trackerById[s.id] || s);
}

/**
 * Alterna (marca o desmarca) un producto de una venta fiada como cancelado/priorizado.
 */
export async function toggleSalePaidItem(saleId, itemIndex, currentPaidIndices = []) {
  const current = Array.isArray(currentPaidIndices) ? [...currentPaidIndices] : [];
  const exists = current.includes(itemIndex);
  const updated = exists ? current.filter(i => i !== itemIndex) : [...current, itemIndex];
  await updateDoc(doc(db, 'sales', saleId), {
    paidItemIndices: updated,
  });
  return updated;
}

/**
 * Marca un conjunto de ítems como pagados en sus respectivas ventas al registrar un cobro.
 * @param {Object} selectedMap - { [saleId]: number[] } con los índices de ítems seleccionados
 * @param {Array} currentSales - lista actual de ventas del cliente para conservar marcas previas
 */
export async function markSalePaidItems(selectedMap = {}, currentSales = []) {
  const entries = Object.entries(selectedMap).filter(([, idxs]) => Array.isArray(idxs) && idxs.length > 0);
  if (entries.length === 0) return;

  await Promise.all(entries.map(([saleId, newIndices]) => {
    const existingSale = currentSales.find(s => s.id === saleId);
    const prev = Array.isArray(existingSale?.paidItemIndices) ? existingSale.paidItemIndices : [];
    const merged = [...new Set([...prev, ...newIndices])];
    return updateDoc(doc(db, 'sales', saleId), {
      paidItemIndices: merged,
    });
  }));
}

/**
 * Registra un pago (total o parcial) contra la deuda de un cliente.
 * Si se cobra durante un turno de caja abierto (shiftId), ese monto recién
 * ahí suma al Total Vendido del turno — la venta fiada original no sumó
 * nada porque todavía no había entrado como plata real a la caja.
 */
export async function registerCreditPayment({ clientId, clientName, amount, note, cashierId, cashierName, shiftId }) {
  const parsedAmount = parseFloat(amount) || 0;
  const paymentRef = await addDoc(collection(db, 'credit_payments'), {
    clientId,
    clientName,
    amount: parsedAmount,
    note: note?.trim() || null,
    cashierId,
    cashierName,
    shiftId: shiftId || null,
    date: new Date(),
    status: 'active',
  });

  if (shiftId) {
    await updateDoc(doc(db, 'shifts', shiftId), {
      salesTotal: increment(parsedAmount),
    });
  }

  return paymentRef;
}

/**
 * Anula un pago ya registrado (no lo borra — vuelve a sumar la deuda).
 * Si ese cobro había sumado al Total Vendido de un turno (shiftId/amount del
 * pago original), se lo descuenta para no dejarlo de más.
 */
export async function voidCreditPayment(paymentId, { voidedBy, voidReason, shiftId, amount }) {
  await updateDoc(doc(db, 'credit_payments', paymentId), {
    status: 'voided',
    voidedBy,
    voidedAt: new Date(),
    voidReason: voidReason?.trim() || null,
  });

  if (shiftId) {
    await updateDoc(doc(db, 'shifts', shiftId), {
      salesTotal: increment(-(parseFloat(amount) || 0)),
    });
  }
}

/**
 * Convierte el valor de un <input type="date"> (yyyy-MM-dd) en Date.
 * Hoy usa la hora actual; una fecha anterior usa el mediodía local para
 * evitar que el huso horario la corra de día.
 */
export function dateFromInputPY(str) {
  const [y, m, d] = (str || '').split('-').map(Number);
  const now = new Date();
  const isToday = now.getFullYear() === y && (now.getMonth() + 1) === m && now.getDate() === d;
  return isToday ? now : new Date(y, m - 1, d, 12, 0, 0, 0);
}

/**
 * Carga una deuda a mano (ej.: anotada en un cuaderno) con la fecha en que
 * realmente ocurrió. Suma al saldo del cliente pero NO es una venta: no entra
 * en cajas, cierres de turno ni reportes de ventas.
 */
export async function registerManualCharge({ clientId, clientName, amount, date, note, createdById, createdByName }) {
  return addDoc(collection(db, 'credit_charges'), {
    clientId,
    clientName,
    amount: parseFloat(amount) || 0,
    date,
    note: note?.trim() || null,
    createdById:   createdById   || null,
    createdByName: createdByName || null,
    createdAt: new Date(),
    status: 'active',
  });
}

/** Anula una deuda manual (no la borra — deja de sumar al saldo). */
export async function voidManualCharge(chargeId, { voidedBy }) {
  return updateDoc(doc(db, 'credit_charges', chargeId), {
    status: 'voided',
    voidedBy,
    voidedAt: new Date(),
  });
}

/** Crea un cliente mínimo (solo nombre obligatorio) para cargarle una deuda. */
export async function createQuickClient({ name, ruc, phone }) {
  const client = {
    name:    name.trim(),
    ruc:     (ruc || '').trim(),
    address: '',
    email:   '',
    phone:   (phone || '').trim(),
  };
  const ref = await addDoc(collection(db, 'clients'), client);
  return { id: ref.id, ...client };
}
