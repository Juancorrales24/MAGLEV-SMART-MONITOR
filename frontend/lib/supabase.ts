import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
let client: SupabaseClient<Database> | null = null;
export function isConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(url && /^https?:\/\//.test(url) && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
export function getSupabase() {
  if (!isConfigured()) throw new Error('Configura las variables de Supabase en frontend/.env.local.');
  if (!client) client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}
