import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stationViews, lastDetection, activeStation, shownDetection, segmentStats, lapStats, nextStation, linkState, eventKindLabel, sensorEvents, stationName } from '../lib/train-state';
import { restartsInWindow, resetReasonLabel, formatUptime, latestHealth } from '../lib/device-health';
import type { DeviceHealth } from '../lib/database.types';
import type { Station, TrainStatus } from '../lib/database.types';
// Filas de prueba: nunca se cargan en la aplicación ni en Supabase.
let counter = 0;
function event(station_number: number | null, detected: boolean | null, created_at: string, extra: Partial<TrainStatus> = {}): TrainStatus {
  return { id: `row-${++counter}`, device_id: 'dev-1', sample_id: `s-${counter}`, sampled_at: null, created_at, station_number, detected, prev_station_number: null, ms_from_prev: null, lap_ms: null, levitation_height: null, stability: null, temperature: null, ...extra };
}
function health(uptime_s: number, created_at: string, extra: Partial<DeviceHealth> = {}): DeviceHealth {
  return { id: `h-${++counter}`, device_id: 'dev-1', sample_id: `hs-${counter}`, sampled_at: null, created_at, reset_reason: 'alimentacion', uptime_s, rssi_dbm: -44, free_heap_b: 137000, queue_dropped: 0, ...extra };
}
const stations: Station[] = [
  { id: 'a', position: 1, name: 'Andén Norte', gap_to_next_m: 2.5, created_at: '' },
  { id: 'b', position: 2, name: 'Central', gap_to_next_m: null, created_at: '' },
  { id: 'c', position: 3, name: 'Andén Sur', gap_to_next_m: null, created_at: '' }
];

test('una llegada marca presencia activa solo en su propia estación', () => {
  const views = stationViews([event(2, true, '2026-11-07T10:00:00Z')], stations);
  assert.equal(views[1].present, true);
  assert.equal(views[0].present, false);
  // Sin evento propio, la estación 3 no se da por alcanzada ni por descartada con datos inventados.
  assert.equal(views[2].lastEvent, null);
  assert.equal(views[2].lastDetection, null);
});

test('la salida retira la presencia activa pero conserva la última detección', () => {
  const rows = [event(2, true, '2026-11-07T10:00:00Z'), event(2, false, '2026-11-07T10:00:30Z')];
  const views = stationViews(rows, stations);
  assert.equal(views[1].present, false);
  assert.equal(views[1].lastDetection?.created_at, '2026-11-07T10:00:00Z');
  assert.equal(lastDetection(rows)?.station_number, 2);
  assert.equal(activeStation(views), null);
});

test('la última estación detectada no cambia sin un evento de otro sensor', () => {
  const rows = [event(1, true, '2026-11-07T09:00:00Z'), event(1, false, '2026-11-07T09:01:00Z')];
  assert.equal(lastDetection(rows)?.station_number, 1);
  const views = stationViews(rows, stations);
  assert.equal(views[1].present, false); assert.equal(views[2].present, false);
});

test('el orden de llegada de las filas no altera el estado derivado', () => {
  const a = event(3, true, '2026-11-07T11:00:00Z'); const b = event(3, false, '2026-11-07T11:05:00Z');
  for (const rows of [[a, b], [b, a]]) {
    const views = stationViews(rows, stations);
    assert.equal(views[2].present, false);
    assert.equal(views[2].lastEvent?.created_at, '2026-11-07T11:05:00Z');
  }
});

test('las filas heredadas de levitación (sin station_number) quedan fuera de las vistas', () => {
  const legacy = event(null, null, '2026-11-07T12:00:00Z');
  legacy.levitation_height = 12.5; legacy.stability = 90;
  const rows = [legacy, event(1, true, '2026-11-07T11:00:00Z')];
  assert.equal(sensorEvents(rows).length, 1);
  assert.equal(lastDetection(rows)?.station_number, 1);
});

test('un número de estación fuera de 1-3 se descarta en lugar de pintarse', () => {
  assert.equal(sensorEvents([event(7, true, '2026-11-07T12:00:00Z')]).length, 0);
});

test('los nombres salen de la tabla stations y tienen respaldo', () => {
  assert.equal(stationName(stations, 2), 'Central');
  assert.equal(stationName([], 3), 'Estación 3');
  assert.equal(stationName([{ id: 'x', position: 1, name: '   ', gap_to_next_m: null, created_at: '' }], 1), 'Estación 1');
});

test('el tipo de evento distingue llegada de salida y no inventa uno cuando falta', () => {
  assert.equal(eventKindLabel(event(1, true, '')), 'Llegada');
  assert.equal(eventKindLabel(event(1, false, '')), 'Salida');
  assert.equal(eventKindLabel(event(1, null, '')), 'Sin datos');
});

test('un registro antiguo nunca se presenta como recepción en curso', () => {
  const base = { hasDevices: true, enabled: true, staleSeconds: 60 };
  assert.equal(linkState({ ...base, lastSeen: '2020-01-01T00:00:00Z', receiving: false }).key, 'stale');
  assert.equal(linkState({ ...base, lastSeen: '2020-01-01T00:00:00Z', receiving: false }).ok, false);
  assert.equal(linkState({ ...base, lastSeen: '2026-11-07T10:00:00Z', receiving: true }).ok, true);
});

test('cada motivo de no recepción tiene su propio estado', () => {
  const base = { hasDevices: true, enabled: true, receiving: false, staleSeconds: 60 };
  assert.equal(linkState({ ...base, hasDevices: false }).key, 'none');
  assert.equal(linkState({ ...base, enabled: false, lastSeen: '2026-11-07T10:00:00Z' }).key, 'disabled');
  assert.equal(linkState({ ...base, lastSeen: null }).key, 'empty');
  assert.equal(linkState({ ...base, online: false }).key, 'offline');
  assert.equal(linkState({ ...base, error: 'fallo de lectura' }).key, 'error');
  // El error de lectura se antepone a cualquier otra lectura del estado.
  assert.equal(linkState({ ...base, error: 'fallo', receiving: true, lastSeen: '2026-11-07T10:00:00Z' }).ok, false);
});

test('la retención muestra el paso recién recibido aunque el sensor ya esté libre', () => {
  const rows = [event(2, true, '2026-11-07T10:00:00Z'), event(2, false, '2026-11-07T10:00:01Z')];
  const views = stationViews(rows, stations);
  assert.equal(activeStation(views), null);
  const shown = shownDetection(views, 2);
  assert.equal(shown?.view.position, 2);
  assert.equal(shown?.held, true);
  // Sin retención vigente no se inventa ninguna detección.
  assert.equal(shownDetection(views, null), null);
});

test('la presencia activa tiene prioridad sobre la retención de otra estación', () => {
  const rows = [event(1, true, '2026-11-07T10:00:00Z'), event(1, false, '2026-11-07T10:00:01Z'), event(3, true, '2026-11-07T10:00:04Z')];
  const shown = shownDetection(stationViews(rows, stations), 1);
  assert.equal(shown?.view.position, 3);
  assert.equal(shown?.held, false);
});

test('el circuito avanza 1→2→3→1', () => {
  assert.deepEqual([1, 2, 3].map(nextStation), [2, 3, 1]);
});

test('rapidez por tramo: solo con intervalo del ESP32, y la rapidez solo con distancia medida', () => {
  const rows = [
    event(2, true, '2026-11-07T10:00:05Z', { prev_station_number: 1, ms_from_prev: 5000 }),
    event(2, true, '2026-11-07T10:00:18Z', { prev_station_number: 1, ms_from_prev: 4000 }),
    event(3, true, '2026-11-07T10:00:22Z', { prev_station_number: 2, ms_from_prev: 4100 }),
    // Llegada sin intervalo (primera pasada tras un arranque): no entra en la estadística.
    event(1, true, '2026-11-07T10:00:26Z')
  ];
  const [s12, s23, s31] = segmentStats(rows, stations);
  assert.equal(s12.count, 2);
  assert.equal(s12.lastMs, 4000);           // la más reciente, no la primera
  assert.equal(s12.meanMs, 4500);
  assert.equal(s12.lastSpeedMs, 2.5 / 4);   // 2,5 m en 4 s
  assert.equal(s23.count, 1);
  assert.equal(s23.lastSpeedMs, null);      // tramo sin distancia medida: tiempo sí, rapidez no
  assert.equal(s31.count, 0);
  assert.equal(s31.lastMs, null);
});

test('tiempo de vuelta: último, promedio y mejor; sin registros no se inventa nada', () => {
  assert.deepEqual(lapStats([event(1, true, '2026-11-07T10:00:00Z')]), { count: 0, lastMs: null, meanMs: null, bestMs: null });
  const rows = [
    event(1, true, '2026-11-07T10:00:00Z', { lap_ms: 13400 }),
    event(2, true, '2026-11-07T10:00:05Z', { lap_ms: 13000 }),
    // La salida nunca lleva lap_ms; si llegara, el filtro por detected la ignora igual.
    event(2, false, '2026-11-07T10:00:06Z')
  ];
  const laps = lapStats(rows);
  assert.deepEqual(laps, { count: 2, lastMs: 13000, meanMs: 13200, bestMs: 13000 });
});

test('salud: los reinicios se cuentan cuando el tiempo encendido deja de crecer', () => {
  const rows = [ // ordenadas de más reciente a más antigua, como la consulta
    health(40, '2026-11-07T10:02:00Z'),
    health(10, '2026-11-07T10:01:30Z'),  // reinicio: venía de 500 s
    health(500, '2026-11-07T10:01:00Z'),
    health(470, '2026-11-07T10:00:30Z')
  ];
  assert.equal(restartsInWindow(rows), 1);
  assert.equal(restartsInWindow([]), 0);
  assert.equal(latestHealth(rows)?.uptime_s, 40);
});

test('salud: etiquetas de arranque conocidas, texto crudo para lo desconocido y uptime legible', () => {
  assert.match(resetReasonLabel('brownout'), /brownout/i);
  assert.equal(resetReasonLabel('algo_nuevo'), 'algo_nuevo'); // no se oculta un motivo no mapeado
  assert.equal(resetReasonLabel(null), 'Sin datos');
  assert.equal(formatUptime(45), '45 s');
  assert.equal(formatUptime(125), '2 min 5 s');
  assert.equal(formatUptime(7260), '2 h 1 min');
  assert.equal(formatUptime(null), null);
});
