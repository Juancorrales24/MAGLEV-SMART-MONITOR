import { test } from 'node:test';
import assert from 'node:assert/strict';
import { telemetrySchema, trainSchema, healthSchema, updateStationSchema, newUserSchema } from '../lib/validation';
import { fresh, toCsv, errorMessage } from '../lib/format';
const sample_id = 'c0f1dd43-6db9-46fd-8b89-399a2ce4c480';
// Datos exclusivamente de prueba: nunca se cargan en la aplicación ni en Supabase.
test('acepta cero real y conserva campos ausentes sin inventar cifras', () => {
  const result = telemetrySchema.parse({ sample_id, measurements: { voltage: 0, current: null } });
  assert.equal(result.measurements?.voltage, 0); assert.equal(result.measurements?.power, undefined);
});
test('rechaza ausencia de lecturas, bloques vacíos y todos nulos', () => {
  for (const p of [{ sample_id }, { sample_id, measurements: {} }, { sample_id, solar_station: { panel_voltage: null } }]) assert.equal(telemetrySchema.safeParse(p).success, false);
});
test('evento ferroviario: exige station_number 1-3 y detected booleano, y acepta la salida', () => {
  // Ejemplo 5.1 del contrato acordado: llegada del tren a la estación 2.
  assert.equal(telemetrySchema.safeParse({ sample_id, train_status: { station_number: 2, detected: true } }).success, true);
  // `detected: false` es la salida del sensor: un evento válido, no una lectura vacía.
  assert.equal(telemetrySchema.safeParse({ sample_id, train_status: { station_number: 2, detected: false } }).success, true);
  for (const train of [{ station_number: 0, detected: true }, { station_number: 4, detected: true }, { station_number: 2.5, detected: true },
    { station_number: 2 }, { detected: true }, { station_number: 2, detected: 'true' }, { station_number: 2, detected: true, levitation_height: 10 }])
    assert.equal(telemetrySchema.safeParse({ sample_id, train_status: train }).success, false);
});
test('bloque solar: acepta voltaje de panel y de batería con carga estimada', () => {
  // Ejemplo 5.2 del contrato acordado.
  const result = telemetrySchema.parse({ sample_id, solar_station: { panel_voltage: 5.8, battery_voltage: 3.7, battery_level: 20 } });
  assert.equal(result.solar_station?.battery_voltage, 3.7);
  assert.equal(telemetrySchema.safeParse({ sample_id, solar_station: { battery_voltage: 10001 } }).success, false);
});
test('rechaza texto, NaN, infinito y porcentajes fuera del rango', () => {
  for (const value of ['12.4', NaN, Infinity, -1, 101]) assert.equal(telemetrySchema.safeParse({ sample_id, solar_station: { battery_level: value } }).success, false);
});
test('rechaza identificadores erróneos, campos desconocidos y fecha futura', () => {
  assert.equal(telemetrySchema.safeParse({ sample_id: 'x', measurements: { voltage: 2 } }).success, false);
  assert.equal(telemetrySchema.safeParse({ sample_id, measurements: { voltage: 2 }, admin: true }).success, false);
  assert.equal(telemetrySchema.safeParse({ sample_id, sampled_at: new Date(Date.now() + 600000).toISOString(), measurements: { voltage: 2 } }).success, false);
});
test('contrato con MaglevSender.ino: acepta su cuerpo y rechaza null que el firmware elimina', () => {
  // Forma exacta que produce el firmware: UUID v4 en minúsculas y bloques del productor sin miembros null.
  assert.equal(telemetrySchema.safeParse({ sample_id, sampled_at: '2026-01-01T00:00:00Z', measurements: { voltage: 12.5, energy: 1000000000000 }, train_status: { station_number: 1, detected: true }, solar_station: { panel_voltage: 5.8, battery_level: 0 } }).success, true);
  // Sin el filtrado del firmware, un bloque o fecha null descartaría las lecturas válidas del mismo mensaje.
  for (const extra of [{ train_status: null }, { sampled_at: null }]) assert.equal(telemetrySchema.safeParse({ sample_id, measurements: { voltage: 2 }, ...extra }).success, false);
});
test('exige contraseña inicial larga y rol conocido', () => {
  assert.equal(newUserSchema.safeParse({ name: 'Prueba', email: 'qa@example.com', password: 'short', role: 'admin' }).success, false);
  assert.equal(newUserSchema.safeParse({ name: 'Prueba', email: 'qa@example.com', password: 'long-password-123', role: 'root' }).success, false);
});
test('una fecha antigua o ausente nunca se considera LIVE', () => {
  const now = Date.now(); assert.equal(fresh(null, now), false); assert.equal(fresh(new Date(now - 600000).toISOString(), now), false); assert.equal(fresh(new Date(now).toISOString(), now), true);
});
test('CSV escapa comillas, neutraliza fórmulas de texto y mantiene números', () => {
  const csv = toCsv(['Nombre', 'Valor'], [['=SUM(A1:A2)', -4], ['texto "citado"', null]]);
  assert.ok(csv.includes('"\'=SUM(A1:A2)"')); assert.ok(csv.includes('"-4"')); assert.ok(csv.includes('texto ""citado""'));
});
test('un error sin mensaje nunca se muestra vacío', () => {
  for (const e of [{ message: '' }, { message: '   ' }, { message: null }, new Error(''), null, 'texto']) assert.ok(errorMessage(e).length > 0);
  assert.equal(errorMessage(new Error('fallo')), 'fallo');
});

test('intervalos del tren: solo en llegadas, en pareja y dentro del tope de 10 minutos', () => {
  const ok = { station_number: 2, detected: true, prev_station_number: 1, ms_from_prev: 4800, lap_ms: 13200 };
  assert.ok(trainSchema.safeParse(ok).success);
  assert.ok(trainSchema.safeParse({ station_number: 2, detected: true }).success); // primera pasada: sin intervalos
  assert.ok(!trainSchema.safeParse({ ...ok, detected: false }).success);           // la salida no lleva intervalos
  assert.ok(!trainSchema.safeParse({ station_number: 2, detected: true, ms_from_prev: 4800 }).success); // sin pareja
  assert.ok(!trainSchema.safeParse({ station_number: 2, detected: true, lap_ms: 700000 }).success);     // no es una vuelta
});

test('salud del dispositivo: bloque completo aceptado, y basta por sí solo como mensaje', () => {
  const health = { reset_reason: 'brownout', uptime_s: 120, rssi_dbm: -44, free_heap_b: 137000, queue_dropped: 0 };
  assert.ok(healthSchema.safeParse(health).success);
  assert.ok(!healthSchema.safeParse({ ...health, rssi_dbm: 5 }).success);        // un RSSI positivo no existe
  assert.ok(!healthSchema.safeParse({ ...health, reset_reason: '' }).success);
  assert.ok(telemetrySchema.safeParse({ sample_id: '8c7c84ea-6cb5-4bb1-96e7-ef5a24beb4b9', device_health: health }).success);
});

test('estaciones: se puede cambiar solo la distancia, borrarla con null, y algo hay que cambiar', () => {
  assert.ok(updateStationSchema.safeParse({ position: 1, gap_to_next_m: 2.35 }).success);
  assert.ok(updateStationSchema.safeParse({ position: 1, gap_to_next_m: null }).success);
  assert.ok(updateStationSchema.safeParse({ position: 1, name: 'Andén Norte' }).success);
  assert.ok(!updateStationSchema.safeParse({ position: 1 }).success);
  assert.ok(!updateStationSchema.safeParse({ position: 1, gap_to_next_m: -2 }).success);
});
