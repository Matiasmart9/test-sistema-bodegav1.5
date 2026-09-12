// src/utils/creditUtils.js
// Lógica compartida del sistema de Fiado (ventas a crédito).
import { collection, query, where, getDocs, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Trae el resumen de crédito de un cliente: ventas fiadas (no anuladas),
 * pagos activos, y el saldo pendiente = ventas - pagos.
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

  const [salesSnap, paymentsSnap] = await Promise.all([getDocs(salesQ), getDocs(paymentsQ)]);

  const sales = salesSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(s => s.status !== 'canceled')
    .map(s => ({ ...s, dateObj: s.date?.toDate ? s.date.toDate() : new Date(s.date) }))
    .sort((a, b) => b.dateObj - a.dateObj);

  const payments = paymentsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .map(p => ({ ...p, dateObj: p.date?.toDate ? p.date.toDate() : new Date(p.date) }))
    .sort((a, b) => b.dateObj - a.dateObj);

  const totalSold = sales.reduce((acc, s) => acc + (parseFloat(s.total) || 0), 0);
  const totalPaid = payments
    .filter(p => p.status !== 'voided')
    .reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);

  return {
    sales,
    payments,
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
