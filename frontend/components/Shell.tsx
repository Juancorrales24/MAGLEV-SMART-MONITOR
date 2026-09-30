'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { LayoutDashboard, TrainFront, Sun, Radio, History, Users, SlidersHorizontal, LogOut, Menu, X, RefreshCw, ChevronRight } from 'lucide-react';
import { Brand, Badge, Notice, LoadingState } from './ui';
import { useAuth } from '@/hooks/use-auth';
import { TelemetryProvider, useTelemetry, useLiveState } from '@/hooks/use-telemetry';
import { dateTime, errorMessage } from '@/lib/format';
const navigation = [
  { href: '/dashboard', label: 'Vista general', icon: LayoutDashboard }, { href: '/train', label: 'Tren Maglev', icon: TrainFront },
  { href: '/solar', label: 'Estación solar', icon: Sun }, { href: '/monitoring', label: 'Tiempo real', icon: Radio },
  { href: '/history', label: 'Historial', icon: History }, { href: '/users', label: 'Usuarios', icon: Users, admin: true },
  { href: '/settings', label: 'Configuración', icon: SlidersHorizontal }
];
export function ProtectedShell({ children }: { children: ReactNode }) {
  const auth = useAuth(); const router = useRouter(); const [error, setError] = useState('');
  useEffect(() => { if (!auth.loading && (!auth.configured || !auth.user)) router.replace('/login'); }, [auth.loading, auth.user, auth.configured, router]);
  if (auth.loading || !auth.user) return <main className="standalone"><Brand/><LoadingState text="Verificando sesión…"/></main>;
  if (!auth.profile?.active || auth.error) return <main className="standalone"><Brand/><h1>{auth.error ? 'No se pudo verificar el acceso' : 'Acceso pendiente'}</h1><Notice>{auth.error || 'Tu cuenta está inactiva o no tiene un perfil. Contacta al administrador.'}</Notice>{error && <Notice tone="error">{error}</Notice>}<button className="button" onClick={() => location.reload()}>Reintentar</button><button className="button" onClick={() => auth.signOut().catch(e => setError(errorMessage(e)))}>Cerrar sesión</button></main>;
  return <TelemetryProvider key={auth.user.id}><Shell>{children}</Shell></TelemetryProvider>;
}
function Shell({ children }: { children: ReactNode }) {
  const auth = useAuth(); const pathname = usePathname(); const feed = useTelemetry(); const { live } = useLiveState();
  const [menu, setMenu] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { setMenu(false); }, [pathname]);
  useEffect(() => { const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); }; document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape); }, []);
  const section = navigation.find(n => n.href === pathname)?.label || 'Centro de control';
  return <div className="app-shell"><a className="skip-link" href="#main">Saltar al contenido</a>{menu && <button className="menu-backdrop" onClick={() => setMenu(false)} aria-label="Cerrar menú"/>}<aside className={`sidebar ${menu ? 'open' : ''}`}><div className="sidebar-brand"><Brand/><button className="icon-button mobile-only" aria-label="Cerrar menú" onClick={() => setMenu(false)}><X/></button></div><p className="nav-caption">CENTRO DE CONTROL</p><nav aria-label="Navegación principal">{navigation.filter(n => !n.admin || auth.profile?.role === 'admin').map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={`nav-item ${pathname === href ? 'active' : ''}`} aria-current={pathname === href ? 'page' : undefined}><Icon size={19}/><span>{label}</span>{pathname === href && <ChevronRight size={16}/>}</Link>)}</nav><div className="sidebar-bottom"><div className="system-note"><span className="system-logo"><Radio size={19}/></span><div><strong>Adquisición de datos</strong><small>{live ? 'Recibiendo lecturas' : 'En espera del sistema'}</small></div></div><div className="user-card"><span className="avatar">{(auth.profile?.name || 'U').slice(0, 2).toUpperCase()}</span><div><strong>{auth.profile?.name}</strong><small>{auth.profile?.role === 'admin' ? 'Administrador' : 'Observador'}</small></div><button className="icon-button" title="Cerrar sesión" aria-label="Cerrar sesión" onClick={() => auth.signOut().catch(e => setError(errorMessage(e)))}><LogOut size={18}/></button></div></div></aside><div className="workspace"><header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-only" aria-label="Abrir menú" aria-expanded={menu} onClick={() => setMenu(true)}><Menu/></button><span>Monitoreo</span><ChevronRight size={14}/><strong>{section}</strong></div><div className="topbar-right"><span className="version">V 1.1</span><Badge tone={live ? 'live' : 'muted'}>{live ? '● LIVE' : 'EN ESPERA'}</Badge></div></header><main id="main" className="main-content"><div className="device-toolbar"><label>Dispositivo<select value={feed.deviceId} onChange={e => feed.selectDevice(e.target.value)} disabled={!feed.devices.length}>{!feed.devices.length && <option value="">Sin dispositivos registrados</option>}{feed.devices.map(d => <option key={d.id} value={d.id}>{d.name}{d.enabled ? '' : ' · inactivo'}</option>)}</select></label><div><span className="sync-label">Última consulta: {dateTime(feed.lastSync)}</span><button className="icon-button" title="Actualizar datos" aria-label="Actualizar datos" disabled={busy} onClick={async () => { setBusy(true); await feed.refresh(); setBusy(false); }}><RefreshCw size={18} className={busy ? 'spin' : ''}/></button></div></div>{!feed.online && <Notice tone="error">Sin conexión a Internet. Las lecturas visibles pueden estar desactualizadas.</Notice>}{feed.error && <Notice tone="error">No se pudo actualizar la información: {feed.error}</Notice>}{error && <Notice tone="error">{error}</Notice>}{children}<footer className="page-footer"><span>MAGLEV SMART MONITOR</span><span>Fechas en la zona horaria de tu navegador</span></footer></main></div></div>;
}
