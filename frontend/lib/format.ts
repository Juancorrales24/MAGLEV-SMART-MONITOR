export const STALE_SECONDS = Math.max(10, Number(process.env.NEXT_PUBLIC_STALE_SECONDS) || 60);
export function number(value: number | null | undefined, digits = 2) { return value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('es-CO', { maximumFractionDigits: digits }); }
export function dateTime(value: string | null | undefined) { return value ? new Date(value).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'medium' }) : 'Sin registros'; }
export function time(value: string) { return new Date(value).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
/** Fecha y hora por separado para las tablas de eventos. Sin dato real nunca se rellena con ceros. */
export function dateOnly(value: string | null | undefined) { return value ? new Date(value).toLocaleDateString('es-CO', { dateStyle: 'short' }) : NO_DATA; }
export function clock(value: string | null | undefined) { return value ? time(value) : NO_DATA; }
export const NO_DATA = 'Sin datos';
/** Antigüedad de una lectura respecto del momento actual: la hora del dato no es «ahora». */
export function relativeAge(value: string | null | undefined, now = Date.now()) {
  if (!value) return NO_DATA;
  const seconds = Math.round((now - new Date(value).getTime()) / 1000);
  if (!Number.isFinite(seconds)) return NO_DATA;
  if (seconds < 1) return 'justo ahora';
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.floor(seconds / 60); if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60); if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}
export function fresh(value: string | null | undefined, now = Date.now()) {
  if (!value) return false;
  const age = now - new Date(value).getTime();
  return age >= -5000 && age < STALE_SECONDS * 1000;
}
export function errorMessage(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error && error.message != null ? String(error.message).trim() : '';
  return message || 'No fue posible completar la operación. Intenta de nuevo.';
}
export function safeCsvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  const safe = /^[=+@\-\t\r]/.test(text) && typeof value !== 'number' ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function toCsv(headers: string[], rows: unknown[][]) { return '\uFEFF' + [headers, ...rows].map(row => row.map(safeCsvCell).join(';')).join('\r\n'); }
