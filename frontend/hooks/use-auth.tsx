'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase, isConfigured } from '@/lib/supabase';
import { errorMessage } from '@/lib/format';
import type { Profile } from '@/lib/database.types';
type Auth = { user: User | null; profile: Profile | null; loading: boolean; error: string; configured: boolean; signOut: () => Promise<void> };
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null); const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const configured = isConfigured();
  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    let alive = true; let sequence = 0; const client = getSupabase();
    const load = async () => {
      const current = ++sequence;
      try {
        const { data: { session } } = await client.auth.getSession();
        if (!alive || current !== sequence) return;
        if (!session) { setUser(null); setProfile(null); setError(''); setLoading(false); return; }
        const result = await client.from('profiles').select('*').eq('id', session.user.id).single();
        if (!alive || current !== sequence) return;
        setUser(session.user); setProfile(result.data); setError(result.error ? 'No fue posible cargar tu perfil. Verifica los scripts SQL y tu conexión.' : '');
      } catch (e) { if (alive && current === sequence) setError(errorMessage(e)); }
      finally { if (alive && current === sequence) setLoading(false); }
    };
    void load();
    const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { ++sequence; setUser(null); setProfile(null); setLoading(false); }
      else setTimeout(() => { if (alive) void load(); }, 0);
    });
    const interval = setInterval(() => { void load(); }, 30000);
    return () => { alive = false; ++sequence; subscription.unsubscribe(); clearInterval(interval); };
  }, [configured]);
  const signOut = async () => { const { error } = await getSupabase().auth.signOut(); if (error) throw error; setUser(null); setProfile(null); };
  return <Context.Provider value={{ user, profile, loading, error, configured, signOut }}>{children}</Context.Provider>;
}
export function useAuth() { const value = useContext(Context); if (!value) throw new Error('AuthProvider no está disponible.'); return value; }
