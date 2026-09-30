import { getSupabase } from './supabase';
export async function api<T>(url: string, method: string, body?: unknown): Promise<T> {
  const { data: { session } } = await getSupabase().auth.getSession();
  if (!session) throw new Error('Tu sesión terminó. Vuelve a iniciar sesión.');
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No fue posible completar la operación.');
  return result as T;
}
