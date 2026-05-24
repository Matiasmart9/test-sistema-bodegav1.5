/**
 * Utilidades de fecha/hora para Paraguay (America/Asuncion, UTC-4 estándar / UTC-3 en verano).
 * Siempre usar estas funciones en lugar de toLocaleDateString / toISOString sin timezone.
 */

const TZ = 'America/Asuncion';
const LOCALE = 'es-PY';

/**
 * Formatea una fecha con hora completa.
 * Ej: "24/05/2026, 09:30"
 */
export const formatDateTime = (date) => {
  if (!date) return '-';
  const d = date?.toDate ? date.toDate() : new Date(date);
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: TZ,
  }).format(d);
};

/**
 * Formatea solo la fecha (sin hora).
 * Ej: "24/05/2026"
 */
export const formatDate = (date) => {
  if (!date) return '-';
  const d = date?.toDate ? date.toDate() : new Date(date);
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: TZ,
  }).format(d);
};

/**
 * Formatea solo la hora.
 * Ej: "09:30"
 */
export const formatTime = (date) => {
  if (!date) return '-';
  const d = date?.toDate ? date.toDate() : new Date(date);
  return new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit', minute: '2-digit',
    timeZone: TZ,
  }).format(d);
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
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(d);
};
