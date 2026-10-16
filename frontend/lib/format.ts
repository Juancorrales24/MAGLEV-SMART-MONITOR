export const STALE_SECONDS = Math.max(10, Number(process.env.NEXT_PUBLIC_STALE_SECONDS) || 60);
export function number(value: number | null | undefined, digits = 2) { return value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('es-CO', { maximumFractionDigits: digits }); }
export function dateTime(value: string | null | undefined) { return value ? new Date(value).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'medium' }) : 'Sin registros'; }
export function time(value: string) { return new Date(value).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
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
