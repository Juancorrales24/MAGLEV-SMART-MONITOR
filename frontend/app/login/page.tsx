'use client';
import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ShieldCheck, Sun, TrainFront, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getSupabase } from '@/lib/supabase';
import { Brand, Notice } from '@/components/ui';
export default function Login() {
  const { user, profile, configured, loading } = useAuth(); const router = useRouter();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [show, setShow] = useState(false);
  useEffect(() => { if (!loading && user && profile?.active) router.replace('/dashboard'); }, [user, profile, loading, router]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password }); if (error) throw error; router.replace('/dashboard'); }
    catch { setError('No fue posible iniciar sesión. Verifica el correo, la contraseña y tu conexión.'); }
    finally { setBusy(false); }
  }
  return <main className="login-page"><section className="login-story"><Brand/><div className="login-intro"><p className="eyebrow">MOVILIDAD · ENERGÍA · CONTROL</p><h1>Una visión completa.<br/><span>Cada lectura cuenta.</span></h1><p>Supervisa la levitación magnética y la energía solar desde un mismo centro de control.</p><div className="login-modules"><div><TrainFront/><span>Tren Maglev</span></div><div><Sun/><span>Estación solar</span></div></div></div><p className="login-foot">MAGLEV SMART MONITOR <span>V 1.1</span></p></section><section className="login-form-wrap"><div className="login-form"><span className="login-icon"><ShieldCheck size={28}/></span><p className="eyebrow">ACCESO A LA PLATAFORMA</p><h2>Bienvenido de nuevo</h2><p className="subtle">Ingresa con tu cuenta de monitoreo.</p>{!configured && <Notice>Falta configurar Supabase. Completa <code>frontend/.env.local</code> siguiendo el archivo <code>README.md</code> y reinicia la aplicación.</Notice>}{error && <Notice tone="error">{error}</Notice>}<form onSubmit={submit}><label>Correo electrónico<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com"/></label><label>Contraseña<div className="password-input"><input type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}/><button type="button" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label><button className="button primary full" disabled={!configured || busy}>{busy ? 'Ingresando…' : 'Iniciar sesión'}<ArrowRight size={18}/></button></form><p className="login-help">¿Necesitas acceso o recuperar tu cuenta? Contacta al administrador del proyecto.</p></div></section></main>;
}
