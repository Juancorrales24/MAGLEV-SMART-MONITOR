import { getSupabase } from './supabase';
export async function api<T>(url: string, method: string, body?: unknown): Promise<T> {
  const { data: { session } } = await getSupabase().auth.getSession();
  if (!session) throw new Error('Tu sesión terminó. Vuelve a iniciar sesión.');
  let response: Response;
  try { response = await fetch(url, { method, headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
  catch { throw new Error('No fue posible contactar al servidor. Revisa tu conexión e intenta de nuevo.'); }
  // Una respuesta no JSON (página de error del proxy o de la plataforma) no debe mostrarse como error de sintaxis.
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : '';
    throw new Error(message || 'No fue posible completar la operación.');
  }
  if (result === null) throw new Error('El servidor devolvió una respuesta inválida.');
  return result as T;
}
