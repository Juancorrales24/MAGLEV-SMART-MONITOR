import { z } from 'zod';
const nullable = (min: number, max: number) => z.number().finite().min(min).max(max).nullable().optional();
const nonEmpty = (value: Record<string, unknown>) => Object.values(value).some(v => typeof v === 'number');
export const measurementSchema = z.object({ voltage: nullable(0, 10000), current: nullable(-10000, 10000), power: nullable(-100000000, 100000000), energy: nullable(0, 1e12) }).strict().refine(nonEmpty, 'Incluye al menos una lectura numérica.');
// Evento de sensor infrarrojo: ambos campos son obligatorios y `detected: false` (salida) es válido,
// así que este bloque no usa la regla "al menos un número" de los bloques de medición.
// Los intervalos los mide el ESP32 con su reloj monotónico y solo acompañan llegadas. El tope de
// 10 minutos existe porque un intervalo mayor no es una vuelta sino el tren detenido un rato.
const intervalMs = z.number().int().min(1).max(600000);
export const trainSchema = z.object({
  station_number: z.number().int().min(1).max(3), detected: z.boolean(),
  prev_station_number: z.number().int().min(1).max(3).optional(),
  ms_from_prev: intervalMs.optional(),
  lap_ms: intervalMs.optional()
}).strict()
  .refine(v => (v.prev_station_number === undefined) === (v.ms_from_prev === undefined), 'prev_station_number y ms_from_prev van juntos.')
  .refine(v => v.detected || (v.prev_station_number === undefined && v.lap_ms === undefined), 'Los intervalos solo acompañan llegadas.');
// Autodiagnóstico periódico del ESP32: todos los campos los mide el propio dispositivo.
export const healthSchema = z.object({
  reset_reason: z.string().trim().min(1).max(40),
  uptime_s: z.number().int().min(0).max(4294967295),
  rssi_dbm: z.number().int().min(-120).max(0),
  free_heap_b: z.number().int().min(0).max(1073741824),
  queue_dropped: z.number().int().min(0).max(2147483647)
}).strict();
export const solarSchema = z.object({ panel_voltage: nullable(0, 10000), battery_voltage: nullable(0, 10000), battery_level: nullable(0, 100), panel_current: nullable(-10000, 10000), power_output: nullable(-100000000, 100000000) }).strict().refine(nonEmpty, 'Incluye al menos una lectura numérica.');
export const telemetrySchema = z.object({ sample_id: z.uuid(), sampled_at: z.iso.datetime({ offset: true }).optional(), measurements: measurementSchema.optional(), train_status: trainSchema.optional(), solar_station: solarSchema.optional(), device_health: healthSchema.optional() }).strict().refine(v => v.measurements || v.train_status || v.solar_station || v.device_health, 'Incluye un bloque con mediciones.').refine(v => !v.sampled_at || Date.parse(v.sampled_at) <= Date.now() + 300000, 'La fecha de muestreo no puede estar más de cinco minutos en el futuro.');
export const newUserSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.email().max(254), password: z.string().min(12).max(128), role: z.enum(['admin', 'observer']) }).strict();
export const updateUserSchema = z.object({ id: z.uuid(), name: z.string().trim().min(2).max(100), role: z.enum(['admin', 'observer']), active: z.boolean() }).strict();
export const newDeviceSchema = z.object({ name: z.string().trim().min(2).max(100), kind: z.enum(['train', 'solar', 'combined']), location: z.string().trim().max(200) }).strict();
export const updateDeviceSchema = z.object({ id: z.uuid(), enabled: z.boolean().optional(), rotate: z.boolean().optional() }).strict().refine(v => v.enabled !== undefined || v.rotate === true, 'Indica una operación.');
// name y gap_to_next_m se editan por separado en la interfaz; null en la distancia la borra.
export const updateStationSchema = z.object({
  position: z.number().int().min(1).max(3),
  name: z.string().trim().min(1).max(100).optional(),
  gap_to_next_m: z.number().finite().positive().max(1000).nullable().optional()
}).strict().refine(v => v.name !== undefined || v.gap_to_next_m !== undefined, 'Indica un cambio.');
