/**
 * Utilidades de fecha/hora para Paraguay (America/Asuncion, UTC-4 estándar / UTC-3 en verano).
 * Siempre usar estas funciones en lugar de toLocaleDateString / toISOString sin timezone.
 */

const TZ = 'America/Asuncion';
const LOCALE = 'es-PY';

const getPartsPY = (date) => {
  const d = date?.toDate ? date.toDate() : new Date(date);
  if (isNaN(d.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
    timeZone: TZ,
  }).formatToParts(d);

  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  // Asegurar que "24" (si algún motor devuelve h24) se normalice a "00"
  if (map.hour === '24') map.hour = '00';
  return map;
};

/**
 * Formatea una fecha con hora completa en formato 24hs de Paraguay.
 * Ej: "24/05/2026, 21:30"
 */
export const formatDateTime = (date) => {
  if (!date) return '-';
  const p = getPartsPY(date);
  if (!p) return '-';
  return `${p.day}/${p.month}/${p.year}, ${p.hour}:${p.minute}`;
};

/**
 * Formatea solo la fecha (sin hora).
 * Ej: "24/05/2026"
 */
export const formatDate = (date) => {
  if (!date) return '-';
  const p = getPartsPY(date);
  if (!p) return '-';
  return `${p.day}/${p.month}/${p.year}`;
};

/**
 * Formatea solo la hora en formato 24hs de Paraguay.
 * Ej: "21:02"
 */
export const formatTime = (date) => {
  if (!date) return '-';
  const p = getPartsPY(date);
  if (!p) return '-';
  return `${p.hour}:${p.minute}`;
};

/**
 * Devuelve la fecha "hoy" en formato yyyy-MM-dd según Paraguay.
 * Usar en lugar de new Date().toISOString().split('T')[0] (que usa UTC).
 */
export const todayStrPY = () => {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());
  // 'sv-SE' usa formato ISO yyyy-MM-dd nativo
};

/**
 * Convierte un objeto Date a string yyyy-MM-dd en hora Paraguay.
 * Usar para rellenar inputs type="date".
 */
export const toInputDatePY = (date) => {
  if (!date) return '';
  const d = date?.toDate ? date.toDate() : new Date(date);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(d);
};
