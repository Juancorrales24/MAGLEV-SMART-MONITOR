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

// ---------------------------------------------------------------------------
// Salud del canal Realtime.
//
// El WebSocket se cae sin aviso con frecuencia en redes móviles (hotspot del
// celular) o cuando el navegador suspende la pestaña. Si no se reacciona, el
// panel se queda "congelado" mostrando datos viejos hasta el siguiente sondeo
// completo. Estas funciones deciden cuándo recrear el canal y con qué cadencia
// sondear según el estado del canal.
// ---------------------------------------------------------------------------

/** Red de seguridad cuando el canal está vivo: solo cubre avisos perdidos. */
export const SONDEO_CANAL_VIVO_MS = 20000;
/** Con el canal caído el sondeo ES la fuente de datos: cadencia corta. */
export const SONDEO_CANAL_CAIDO_MS = 4000;

/** Cadencia del sondeo completo según el estado reportado por `subscribe`. */
export function intervaloSondeo(estadoCanal: string) {
  return estadoCanal === 'SUBSCRIBED' ? SONDEO_CANAL_VIVO_MS : SONDEO_CANAL_CAIDO_MS;
}

/** Estados tras los que supabase-js ya no va a entregar más avisos: hay que recrear el canal. */
export function canalRoto(estadoCanal: string) {
  return estadoCanal === 'CHANNEL_ERROR' || estadoCanal === 'TIMED_OUT' || estadoCanal === 'CLOSED';
}

export const ESPERA_RECONEXION_MIN_MS = 1000;
export const ESPERA_RECONEXION_MAX_MS = 15000;

/** Espera exponencial entre intentos de reconexión, acotada para no rendirse nunca del todo. */
export function siguienteEspera(actualMs: number) {
  if (!Number.isFinite(actualMs) || actualMs < ESPERA_RECONEXION_MIN_MS) return ESPERA_RECONEXION_MIN_MS * 2;
  return Math.min(actualMs * 2, ESPERA_RECONEXION_MAX_MS);
}
