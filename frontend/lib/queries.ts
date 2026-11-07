import { getSupabase } from './supabase';
export type RangeFilter = { deviceId: string; from: string; to: string; ascending: boolean };
export type TrainFilter = RangeFilter & { station: string };
export const PAGE_SIZE = 25;
/** Límite superior del rango: datetime-local entrega minutos, así que "Hasta 10:00" incluye 10:00:59.999. */
function upperBound(to: string) { return /T\d{2}:\d{2}$/.test(to) ? new Date(new Date(to).getTime() + 60000).toISOString() : null; }
function range(index: number) { return [index * PAGE_SIZE, (index + 1) * PAGE_SIZE - 1] as const; }
/** Eventos de los sensores infrarrojos. Las filas heredadas sin station_number quedan excluidas. */
export async function queryTrainHistory(filter: TrainFilter, index: number) {
  let query = getSupabase().from('train_status').select('*', { count: 'exact' }).not('station_number', 'is', null);
  if (filter.deviceId) query = query.eq('device_id', filter.deviceId);
  if (filter.station) query = query.eq('station_number', Number(filter.station));
  if (filter.from) query = query.gte('created_at', new Date(filter.from).toISOString());
  if (filter.to) { const limit = upperBound(filter.to); query = limit ? query.lt('created_at', limit) : query.lte('created_at', new Date(filter.to).toISOString()); }
  const [start, end] = range(index);
  const result = await query.order('created_at', { ascending: filter.ascending }).order('id', { ascending: filter.ascending }).range(start, end);
  if (result.error) throw result.error;
  return { rows: result.data, count: result.count ?? 0 };
}
/** Lecturas almacenadas de la estación solar. */
export async function querySolarHistory(filter: RangeFilter, index: number) {
  let query = getSupabase().from('solar_station').select('*', { count: 'exact' });
  if (filter.deviceId) query = query.eq('device_id', filter.deviceId);
  if (filter.from) query = query.gte('created_at', new Date(filter.from).toISOString());
  if (filter.to) { const limit = upperBound(filter.to); query = limit ? query.lt('created_at', limit) : query.lte('created_at', new Date(filter.to).toISOString()); }
  const [start, end] = range(index);
  const result = await query.order('created_at', { ascending: filter.ascending }).order('id', { ascending: filter.ascending }).range(start, end);
  if (result.error) throw result.error;
  return { rows: result.data, count: result.count ?? 0 };
}
