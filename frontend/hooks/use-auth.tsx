'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
  // Usuario cuyo perfil ya se verificó correctamente.
  const verified = useRef<string | null>(null);
  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    let alive = true; let sequence = 0; const client = getSupabase();
    const load = async () => {
      const current = ++sequence;
      try {
        const { data: { session }, error: sessionError } = await client.auth.getSession();
        if (!alive || current !== sequence) return;
        // Si el refresco del token falla por red se conserva el estado; un cierre real llega como SIGNED_OUT.
        if (sessionError && !session && verified.current) return;
        if (!session) { verified.current = null; setUser(null); setProfile(null); setError(''); setLoading(false); return; }
        const result = await client.from('profiles').select('*').eq('id', session.user.id).single();
        if (!alive || current !== sequence) return;
        // Un fallo transitorio (red, servidor) en la revalidación periódica no debe desmontar la aplicación
        // de un usuario ya verificado; solo la ausencia real del perfil (PGRST116) invalida el acceso.
        if (result.error && result.error.code !== 'PGRST116' && verified.current === session.user.id) return;
        verified.current = result.error ? null : session.user.id;
        setUser(session.user); setProfile(result.data); setError(result.error ? 'No fue posible cargar tu perfil. Verifica los scripts SQL y tu conexión.' : '');
      } catch (e) { if (alive && current === sequence && !verified.current) setError(errorMessage(e)); }
      finally { if (alive && current === sequence) setLoading(false); }
    };
    void load();
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { ++sequence; verified.current = null; setUser(null); setProfile(null); setError(''); setLoading(false); }
      else {
        // Un inicio de sesión nuevo deja la sesión "en verificación" hasta cargar el perfil; si no, las rutas
        // protegidas ven loading=false y user=null y redirigen de vuelta a /login.
        if (event === 'SIGNED_IN' && session && session.user.id !== verified.current) { ++sequence; setLoading(true); }
        setTimeout(() => { if (alive) void load(); }, 0);
      }
    });
    const interval = setInterval(() => { void load(); }, 30000);
    return () => { alive = false; ++sequence; subscription.unsubscribe(); clearInterval(interval); };
  }, [configured]);
  const signOut = async () => { const { error } = await getSupabase().auth.signOut(); if (error) throw error; verified.current = null; setUser(null); setProfile(null); };
  return <Context.Provider value={{ user, profile, loading, error, configured, signOut }}>{children}</Context.Provider>;
}
export function useAuth() { const value = useContext(Context); if (!value) throw new Error('AuthProvider no está disponible.'); return value; }
