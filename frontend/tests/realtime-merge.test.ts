import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertarFila, reemplazarFila, compararFilas, FILAS_MAX } from '../lib/realtime-merge';
type F = { id: string; created_at: string };
const f = (id: string, t: string): F => ({ id, created_at: t });

test('inserta la fila nueva al frente y conserva el orden de la consulta', () => {
  const previo = [f('b', '2026-11-12T10:00:02Z'), f('a', '2026-11-12T10:00:01Z')];
  const r = insertarFila(previo, f('c', '2026-11-12T10:00:03Z'));
  assert.deepEqual(r.map(x => x.id), ['c', 'b', 'a']);
});

test('coloca en su sitio una fila que llega fuera de orden', () => {
  const previo = [f('c', '2026-11-12T10:00:03Z'), f('a', '2026-11-12T10:00:01Z')];
  const r = insertarFila(previo, f('b', '2026-11-12T10:00:02Z'));
  assert.deepEqual(r.map(x => x.id), ['c', 'b', 'a']);
});

test('a igual instante desempata por id descendente, como la consulta', () => {
  const previo = [f('a', '2026-11-12T10:00:00Z')];
  const r = insertarFila(previo, f('z', '2026-11-12T10:00:00Z'));
  assert.deepEqual(r.map(x => x.id), ['z', 'a']);
});

test('un aviso repetido no duplica ni provoca un redibujado', () => {
  const previo = [f('a', '2026-11-12T10:00:01Z')];
  const r = insertarFila(previo, f('a', '2026-11-12T10:00:01Z'));
  assert.equal(r, previo, 'debe devolver el MISMO array para que React no redibuje');
});

test('una fila inválida se ignora sin romper nada', () => {
  const previo = [f('a', '2026-11-12T10:00:01Z')];
  assert.equal(insertarFila(previo, null), previo);
  assert.equal(insertarFila(previo, undefined), previo);
  assert.equal(insertarFila(previo, {} as F), previo);
  assert.equal(insertarFila(previo, { id: 'x' } as F), previo);
});

test('nunca crece por encima del tope de filas', () => {
  let filas: F[] = [];
  for (let i = 0; i < FILAS_MAX + 60; i++) filas = insertarFila(filas, f(`id-${i}`, new Date(1800000000000 + i * 1000).toISOString()));
  assert.equal(filas.length, FILAS_MAX);
  // Se conservan las MÁS RECIENTES, que es lo que mira el panel.
  assert.equal(filas[0].id, `id-${FILAS_MAX + 59}`);
});

test('el resultado coincide con rehacer la consulta entera', () => {
  // Simula lo que haría el servidor: ordenar todo el conjunto y recortar.
  const todas = Array.from({ length: 50 }, (_, i) => f(`id-${i}`, new Date(1800000000000 + (i % 7) * 1000).toISOString()));
  let incremental: F[] = [];
  for (const fila of todas) incremental = insertarFila(incremental, fila, 10);
  const consulta = todas.slice().sort(compararFilas).slice(0, 10);
  assert.deepEqual(incremental.map(x => x.id), consulta.map(x => x.id));
});

test('reemplazar actualiza el dispositivo sin tocar los demás', () => {
  const previo = [{ id: 'd1', n: 1 }, { id: 'd2', n: 2 }];
  const r = reemplazarFila(previo, { id: 'd2', n: 99 });
  assert.deepEqual(r, [{ id: 'd1', n: 1 }, { id: 'd2', n: 99 }]);
  assert.notEqual(r, previo);
});

test('reemplazar devuelve el mismo array si no encuentra la fila: hay que recargar', () => {
  const previo = [{ id: 'd1', n: 1 }];
  assert.equal(reemplazarFila(previo, { id: 'nuevo', n: 5 }), previo);
  assert.equal(reemplazarFila(previo, null), previo);
});

// --- Salud del canal Realtime ---
import { intervaloSondeo, canalRoto, siguienteEspera, SONDEO_CANAL_VIVO_MS, SONDEO_CANAL_CAIDO_MS, ESPERA_RECONEXION_MIN_MS, ESPERA_RECONEXION_MAX_MS } from '../lib/realtime-merge';

test('con el canal vivo el sondeo es lento; caído, rápido', () => {
  assert.equal(intervaloSondeo('SUBSCRIBED'), SONDEO_CANAL_VIVO_MS);
  for (const estado of ['CONNECTING', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']) {
    assert.equal(intervaloSondeo(estado), SONDEO_CANAL_CAIDO_MS, estado);
  }
  assert.ok(SONDEO_CANAL_CAIDO_MS < SONDEO_CANAL_VIVO_MS);
});

test('solo los estados terminales obligan a recrear el canal', () => {
  for (const estado of ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']) assert.ok(canalRoto(estado), estado);
  for (const estado of ['SUBSCRIBED', 'CONNECTING', 'JOINING', '']) assert.ok(!canalRoto(estado), estado || '(vacío)');
});

test('la espera de reconexión crece exponencialmente y queda acotada', () => {
  let espera = ESPERA_RECONEXION_MIN_MS;
  const vistas: number[] = [];
  for (let i = 0; i < 8; i++) { vistas.push(espera); espera = siguienteEspera(espera); }
  assert.deepEqual(vistas.slice(0, 5), [1000, 2000, 4000, 8000, 15000]);
  assert.equal(espera, ESPERA_RECONEXION_MAX_MS); // nunca pasa del tope: no se rinde, pero no martillea
});

test('una espera corrupta vuelve al rango válido', () => {
  for (const mala of [0, -5, NaN, Infinity * 0]) {
    const siguiente = siguienteEspera(mala);
    assert.ok(siguiente >= ESPERA_RECONEXION_MIN_MS && siguiente <= ESPERA_RECONEXION_MAX_MS, String(mala));
  }
});
