/**
 * Formatea un número o string numérico agregando puntos como separadores de miles.
 * Ej: 10000 -> "10.000"
 * Ej: "1500000" -> "1.500.000"
 */
export const formatGuaranies = (val) => {
  if (val === undefined || val === null || val === '') return '';
  const clean = val.toString().replace(/\D/g, '');
  if (!clean) return '';
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

/**
 * Limpia un string formateado para obtener solo los dígitos como string.
 * Mantiene el string vacío si no hay entrada.
 * Ej: "10.000" -> "10000"
 * Ej: "" -> ""
 */
export const parseGuaraniesStr = (val) => {
  if (val === undefined || val === null || val === '') return '';
  return val.toString().replace(/\D/g, '');
};

/**
 * Limpia un string formateado y devuelve un entero.
 * Ej: "10.000" -> 10000
 */
export const parseGuaranies = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  const clean = val.toString().replace(/\D/g, '');
  return parseInt(clean, 10) || 0;
};
