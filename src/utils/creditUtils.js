// src/utils/creditUtils.js
// Lógica compartida del sistema de Fiado (ventas a crédito).
import { collection, query, where, getDocs, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Trae el resumen de crédito de un cliente: ventas fiadas (no anuladas),
 * deudas cargadas a mano (no anuladas), pagos activos, y el saldo pendiente
 * = (ventas + deudas manuales) - pagos.
 * También devuelve el detalle ordenado por fecha (más reciente primero)
 * para armar el historial completo.
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

  return {
    sales,
    payments,
    charges,
    totalSold,
    totalPaid,
    balance: totalSold - totalPaid,
  };
}

/** Registra un pago (total o parcial) contra la deuda de un cliente. */
export async function registerCreditPayment({ clientId, clientName, amount, note, cashierId, cashierName }) {
  return addDoc(collection(db, 'credit_payments'), {
    clientId,
    clientName,
    amount: parseFloat(amount) || 0,
    note: note?.trim() || null,
    cashierId,
    cashierName,
    date: new Date(),
    status: 'active',
  });
}

/** Anula un pago ya registrado (no lo borra — vuelve a sumar la deuda). */
export async function voidCreditPayment(paymentId, { voidedBy, voidReason }) {
  return updateDoc(doc(db, 'credit_payments', paymentId), {
    status: 'voided',
    voidedBy,
    voidedAt: new Date(),
    voidReason: voidReason?.trim() || null,
  });
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
