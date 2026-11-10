// Derivaciones puras para las vistas: no consultan la red ni inventan lecturas.
// El prototipo detecta el tren con tres sensores infrarrojos fijos (uno por estación).
// No existe sensor de posición entre estaciones: aquí nunca se interpola ni se supone un trayecto.
import type { Station, TrainStatus } from './database.types';

export const STATION_POSITIONS = [1, 2, 3] as const;

/** Un evento de sensor válido trae número de estación y el booleano de detección. */
export function isSensorEvent(row: TrainStatus) {
  return row.station_number != null && row.detected != null && STATION_POSITIONS.some(p => p === row.station_number);
}

/** Registros heredados de la etapa de levitación (sin station_number) quedan fuera de toda vista. */
export function sensorEvents(train: TrainStatus[]) {
  return train.filter(isSensorEvent).slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export function stationName(stations: Station[], position: number) {
  return stations.find(s => s.position === position)?.name?.trim() || `Estación ${position}`;
}

export type StationView = {
  position: number;
  name: string;
  /** El último evento de ESTE sensor dice detección activa (true) o retirada (false). */
  present: boolean;
  /** Último evento de este sensor, sea llegada o salida. */
  lastEvent: TrainStatus | null;
  /** Última llegada registrada por este sensor; se conserva aunque ya no haya presencia. */
  lastDetection: TrainStatus | null;
};

/**
 * Estado de cada estación a partir de sus PROPIOS eventos.
 * Una estación sin eventos queda «sin registros»: no se deduce nada de las otras.
 */
export function stationViews(train: TrainStatus[], stations: Station[] = []): StationView[] {
  const events = sensorEvents(train);
  return STATION_POSITIONS.map(position => {
    const own = events.filter(e => e.station_number === position);
    return {
      position,
      name: stationName(stations, position),
      present: own[0]?.detected === true,
      lastEvent: own[0] ?? null,
      lastDetection: own.find(e => e.detected === true) ?? null
    };
  });
}

/** Última llegada registrada por cualquiera de los tres sensores. */
export function lastDetection(train: TrainStatus[]) {
  return sensorEvents(train).find(e => e.detected === true) ?? null;
}

/** Estación con detección activa ahora mismo; null si ningún sensor reporta presencia. */
export function activeStation(views: StationView[]) {
  return views.find(v => v.present) ?? null;
}

/**
 * Tiempo que el panel mantiene visible una llegada recién recibida. Es el mismo que
 * RETENCION_ESTACION_MS del firmware (pantalla LCD): el tren está delante del sensor apenas
 * unas décimas de segundo, y sin retención la llegada y la salida suelen llegar en la misma
 * actualización, de modo que el panel no alcanzaba a mostrar el paso.
 */
export const DETECTION_HOLD_MS = 5000;

export type ShownDetection = {
  view: StationView;
  /** true = el sensor ya no reporta presencia; se muestra el paso recién recibido, no una medición en curso. */
  held: boolean;
};

/**
 * Estación a destacar: la que tiene presencia activa o, si el tren ya salió del sensor, la de la
 * llegada que el panel acaba de recibir. `held` las distingue para no presentar la retención
 * como presencia medida.
 */
export function shownDetection(views: StationView[], heldPosition: number | null): ShownDetection | null {
  const active = activeStation(views);
  if (active) return { view: active, held: false };
  const held = heldPosition == null ? null : views.find(v => v.position === heldPosition) ?? null;
  return held ? { view: held, held: true } : null;
}

export type EventKind = 'arrival' | 'departure';
export function eventKind(row: TrainStatus): EventKind | null {
  return row.detected === true ? 'arrival' : row.detected === false ? 'departure' : null;
}
export function eventKindLabel(row: TrainStatus) {
  const kind = eventKind(row);
  return kind === 'arrival' ? 'Llegada' : kind === 'departure' ? 'Salida' : 'Sin datos';
}

export type LinkKey = 'error' | 'offline' | 'none' | 'disabled' | 'empty' | 'stale' | 'receiving';
export type LinkState = { key: LinkKey; label: string; detail: string; ok: boolean };

/**
 * Estado de comunicación del ESP32. `receiving` exige telemetría reciente según `fresh()`:
 * un registro antiguo nunca se presenta como recepción en curso.
 */
export function linkState(input: {
  hasDevices: boolean; enabled?: boolean; lastSeen?: string | null; receiving: boolean;
  error?: string; online?: boolean; staleSeconds: number;
}): LinkState {
  const { hasDevices, enabled, lastSeen, receiving, error = '', online = true, staleSeconds } = input;
  if (error) return { key: 'error', label: 'Error de recepción', detail: error, ok: false };
  if (!online) return { key: 'offline', label: 'Sin conexión a Internet', detail: 'El navegador está desconectado: lo visible puede estar desactualizado.', ok: false };
  if (!hasDevices) return { key: 'none', label: 'Sin dispositivos registrados', detail: 'Registra el ESP32 en Configuración para empezar a recibir telemetría.', ok: false };
  if (enabled === false) return { key: 'disabled', label: 'Dispositivo desactivado', detail: 'El dispositivo no tiene permitido enviar telemetría.', ok: false };
  if (!lastSeen) return { key: 'empty', label: 'Sin registros', detail: 'El dispositivo todavía no ha enviado ninguna lectura.', ok: false };
  if (!receiving) return { key: 'stale', label: 'Sin comunicación reciente', detail: `Han pasado más de ${staleSeconds} s desde la última recepción.`, ok: false };
  return { key: 'receiving', label: 'Comunicación reciente', detail: `Telemetría recibida dentro de los últimos ${staleSeconds} s.`, ok: true };
}

/** Serie temporal de un campo numérico: descarta nulos para no dibujar ceros inventados. */
export function hasReadings<T extends Record<string, unknown>>(rows: T[], field: keyof T & string) {
  return rows.some(r => typeof r[field] === 'number' && Number.isFinite(r[field] as number));
}
