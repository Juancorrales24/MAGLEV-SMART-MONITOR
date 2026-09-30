import { getSupabase } from './supabase';
export type HistoryFilter = { deviceId: string; from: string; to: string; ascending: boolean };
export const PAGE_SIZE = 25;
export async function queryHistory(filter: HistoryFilter, page: number) {
  let query = getSupabase().from('measurements').select('*', { count: 'exact' });
  if (filter.deviceId) query = query.eq('device_id', filter.deviceId);
  if (filter.from) query = query.gte('created_at', new Date(filter.from).toISOString());
  if (filter.to) query = query.lte('created_at', new Date(filter.to).toISOString());
  const result = await query.order('created_at', { ascending: filter.ascending }).order('id', { ascending: filter.ascending }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  if (result.error) throw result.error;
  return { rows: result.data, count: result.count ?? 0 };
}
