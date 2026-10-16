import { test } from 'node:test';
import assert from 'node:assert/strict';
import { telemetrySchema, newUserSchema } from '../lib/validation';
import { fresh, toCsv } from '../lib/format';
const sample_id = 'c0f1dd43-6db9-46fd-8b89-399a2ce4c480';
// Datos exclusivamente de prueba: nunca se cargan en la aplicación ni en Supabase.
test('acepta cero real y conserva campos ausentes sin inventar cifras', () => {
  const result = telemetrySchema.parse({ sample_id, measurements: { voltage: 0, current: null } });
  assert.equal(result.measurements?.voltage, 0); assert.equal(result.measurements?.power, undefined);
});
test('rechaza ausencia de lecturas, bloques vacíos y todos nulos', () => {
  for (const p of [{ sample_id }, { sample_id, measurements: {} }, { sample_id, train_status: { temperature: null } }]) assert.equal(telemetrySchema.safeParse(p).success, false);
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
  assert.equal(telemetrySchema.safeParse({ sample_id, sampled_at: '2026-01-01T00:00:00Z', measurements: { voltage: 12.5, energy: 1000000000000 }, train_status: { temperature: -3 }, solar_station: { battery_level: 0 } }).success, true);
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
