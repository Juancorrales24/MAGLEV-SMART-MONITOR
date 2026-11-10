import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stationViews, lastDetection, activeStation, shownDetection, linkState, eventKindLabel, sensorEvents, stationName } from '../lib/train-state';
import type { Station, TrainStatus } from '../lib/database.types';
// Filas de prueba: nunca se cargan en la aplicación ni en Supabase.
let counter = 0;
function event(station_number: number | null, detected: boolean | null, created_at: string): TrainStatus {
  return { id: `row-${++counter}`, device_id: 'dev-1', sample_id: `s-${counter}`, sampled_at: null, created_at, station_number, detected, levitation_height: null, stability: null, temperature: null };
}
const stations: Station[] = [
  { id: 'a', position: 1, name: 'Andén Norte', created_at: '' },
  { id: 'b', position: 2, name: 'Central', created_at: '' },
  { id: 'c', position: 3, name: 'Andén Sur', created_at: '' }
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
  assert.equal(stationName([{ id: 'x', position: 1, name: '   ', created_at: '' }], 1), 'Estación 1');
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
