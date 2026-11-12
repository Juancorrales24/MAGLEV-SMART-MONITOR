// Aplicación incremental de los avisos de Supabase Realtime.
//
// El panel consultaba las cuatro tablas de telemetría enteras (240 filas cada una,
// ~175 KB) cada vez que llegaba un aviso de cambio. Con el tren en marcha llega un
// aviso cada uno o dos segundos — y además `devices.last_seen` se actualiza en CADA
// mensaje del ESP32 —, así que el navegador se pasaba el rato descargando la misma
// ventana una y otra vez. Al principio apenas se notaba porque las tablas tenían pocas
// filas; cuando la ventana se llenó, la descarga pasó a ser siempre la máxima.
//
// El aviso de Realtime YA trae la fila nueva, así que no hace falta volver a pedirla:
// basta con insertarla en la lista local. Se conserva la consulta periódica completa
// como red de seguridad por si se pierde algún aviso.

/** Filas que el panel mantiene por tabla; coincide con el `limit` de las consultas. */
export const FILAS_MAX = 240;

export type FilaTelemetria = { id: string; created_at: string };

/**
 * Inserta una fila recién llegada manteniendo el mismo orden que la consulta
 * (`created_at` descendente y, a igualdad, `id` descendente) y el mismo tope de filas.
 *
 * Devuelve el array ORIGINAL cuando no hay nada que cambiar (fila repetida o inválida),
 * para que React no vuelva a dibujar sin motivo.
 */
export function insertarFila<T extends FilaTelemetria>(filas: T[], nueva: T | null | undefined, limite = FILAS_MAX): T[] {
  if (!nueva || typeof nueva.id !== 'string' || !nueva.id || typeof nueva.created_at !== 'string') return filas;
  if (filas.some(f => f.id === nueva.id)) return filas;   // el aviso puede repetirse
  const salida = [nueva, ...filas];
  salida.sort(compararFilas);
  return salida.length > limite ? salida.slice(0, limite) : salida;
}

/** Mismo criterio que `order('created_at', desc).order('id', desc)` en la consulta. */
export function compararFilas(a: FilaTelemetria, b: FilaTelemetria) {
  const diferencia = Date.parse(b.created_at) - Date.parse(a.created_at);
  if (diferencia) return diferencia;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * Sustituye una fila por su versión nueva (p. ej. `devices.last_seen`, que el servidor
 * actualiza en cada mensaje del ESP32). Devuelve el array original si no la encuentra,
 * para que el llamante sepa que le conviene recargar.
 */
export function reemplazarFila<T extends { id: string }>(filas: T[], nueva: T | null | undefined): T[] {
  if (!nueva || typeof nueva.id !== 'string') return filas;
  const i = filas.findIndex(f => f.id === nueva.id);
  if (i < 0) return filas;
  const salida = filas.slice();
  salida[i] = nueva;
  return salida;
}
