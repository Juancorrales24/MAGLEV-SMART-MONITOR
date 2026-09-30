import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Database } from './database.types';
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(503, 'El servidor necesita la configuración de Supabase.');
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function requireAdmin(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw new HttpError(401, 'Inicia sesión para continuar.');
  const client = serviceClient(); const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) throw new HttpError(401, 'La sesión no es válida.');
  const { data: profile, error: profileError } = await client.from('profiles').select('*').eq('id', user.id).single();
  if (profileError || !profile?.active || profile.role !== 'admin') throw new HttpError(403, 'Esta operación requiere un administrador activo.');
  return { client, user, profile };
}
export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, 'Usa Content-Type: application/json.');
  const reader = request.body?.getReader(); if (!reader) throw new HttpError(400, 'Falta el contenido JSON.');
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 16384) { await reader.cancel(); throw new HttpError(413, 'El mensaje supera 16 KiB.'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  let parsed: unknown;
  try { const buffer = Buffer.concat(chunks); parsed = JSON.parse(buffer.toString('utf8')); } catch { throw new HttpError(400, 'JSON inválido.'); }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new HttpError(400, result.error.issues.map(i => `${i.path.join('.') || 'datos'}: ${i.message}`).join('; '));
  return result.data;
}
export function reply(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } }); }
export function failure(error: unknown) {
  if (error instanceof HttpError) return reply({ error: error.message }, error.status);
  console.error('MAGLEV: operación del servidor fallida.', error instanceof Error ? error.name : 'DatabaseError');
  return reply({ error: 'No se pudo completar la operación. Revisa la conexión y los scripts SQL del servidor.' }, 500);
}
