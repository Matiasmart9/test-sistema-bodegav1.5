import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { sileo } from 'sileo';

/**
 * Intenta enviar la impresión del ticket original y su copia al servidor local de Node.js (puerto 3001).
 * Si el servidor está apagado o hay un error, retorna false para habilitar el fallback en el navegador.
 * 
 * @param {Object} ticketData - Datos del ticket procesado.
 * @param {Object} storeData - Datos de la tienda cargados de Firestore.
 * @returns {Promise<boolean>} - true si se imprimió con éxito en el servidor local, false en caso contrario.
 */
export async function printTicketService(ticketData, storeData) {
  const payloadOriginal = {
    storeData,
    footerLabel: 'ORIGINAL — CLIENTE',
    ticketData
  };

  const payloadCopy = {
    storeData,
    footerLabel: 'COPIA — TICKET',
    ticketData
  };

  try {
    // 1. Verificar si el servidor local responde al ping (timeout corto de 1.5s)
    const pingRes = await fetch('http://localhost:3001/ping', {
      signal: AbortSignal.timeout(1500),
    });

    if (!pingRes.ok) {
      throw new Error('Servidor local de impresión no responde.');
    }

    // 2. Enviar ticket ORIGINAL
    const resOrig = await fetch('http://localhost:3001/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadOriginal),
      signal: AbortSignal.timeout(5000),
    });
    const resultOrig = await resOrig.json();
    if (!resultOrig.ok) throw new Error(resultOrig.error || 'Error imprimiendo original');

    // 3. Enviar ticket COPIA
    const resCopy = await fetch('http://localhost:3001/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadCopy),
      signal: AbortSignal.timeout(5000),
    });
    const resultCopy = await resCopy.json();
    if (!resultCopy.ok) throw new Error(resultCopy.error || 'Error imprimiendo copia');

    // Notificación de éxito
    sileo?.success({ title: '🖨️ Original y Copia enviados a la impresora.' });
    return true;

  } catch (err) {
    console.warn('Servidor local no disponible, usando navegador como respaldo:', err.message);
    return false;
  }
}
