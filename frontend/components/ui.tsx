import { Activity, ArrowUpRight, Radio, RefreshCw, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { number, NO_DATA } from '@/lib/format';
import type { LinkKey } from '@/lib/train-state';
export function Brand() { return <div className="brand"><span className="brand-symbol">M</span><div><strong>MAG<span>LEV</span></strong><small>SMART MONITOR</small></div></div>; }
export function PageTitle({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) { return <div className="page-title"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="subtle">{description}</p>}</div>{actions && <div className="title-actions">{actions}</div>}</div>; }
export function Panel({ title, subtitle, action, children, className = '' }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) { return <section className={`panel ${className}`}><div className="panel-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>; }
/** Indicador numérico. Un valor ausente se muestra como guion, nunca como cero. */
export function MetricCard({ label, value, unit, icon: Icon = Activity, detail, accent = 'red', digits = 2 }: { label: string; value?: number | null; unit: string; icon?: LucideIcon; detail?: string; accent?: string; digits?: number }) {
  const missing = value == null || !Number.isFinite(value);
  return <article className={`metric ${accent} ${missing ? 'metric-missing' : ''}`}><div className="metric-label"><span>{label}</span><Icon size={19} aria-hidden/></div><div className="metric-value">{number(value, digits)} {!missing && <span>{unit}</span>}</div><div className="metric-detail">{detail ?? (missing ? `${NO_DATA}: el prototipo aún no ha reportado esta lectura.` : 'Última lectura recibida')}</div></article>;
}
/** Indicador de texto (estación, estado, fecha). Mantiene la misma rejilla que MetricCard. */
export function StatCard({ label, value, icon: Icon = Activity, detail, accent = 'red', tone = '' }: { label: string; value: ReactNode; icon?: LucideIcon; detail?: ReactNode; accent?: string; tone?: string }) {
  return <article className={`metric text ${accent} ${tone ? `tone-${tone}` : ''}`}><div className="metric-label"><span>{label}</span><Icon size={19} aria-hidden/></div><div className="metric-value text">{value}</div><div className="metric-detail">{detail}</div></article>;
}
export function EmptyState({ title = 'Sin datos todavía', description = 'La información aparecerá cuando el prototipo envíe su primera lectura.', compact = false }: { title?: string; description?: string; compact?: boolean }) { return <div className={`empty-state ${compact ? 'compact' : ''}`}><span className="empty-icon"><Radio size={26} aria-hidden/></span><h3>{title}</h3><p>{description}</p></div>; }
export function LoadingState({ text = 'Cargando información…' }: { text?: string }) { return <div className="loading" role="status"><RefreshCw className="spin" size={20} aria-hidden/>{text}</div>; }
export function Notice({ children, tone = 'warning' }: { children: ReactNode; tone?: 'warning' | 'error' | 'success' }) { return <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>; }
export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
export function MiniLink({ href, children }: { href: string; children: ReactNode }) { return <a className="text-link" href={href}>{children}<ArrowUpRight size={16} aria-hidden/></a>; }
/**
 * Estado de comunicación con forma y texto propios, no solo color.
 * El punto solo se anima cuando hay recepción reciente.
 */
export function StatusPill({ state, label }: { state: LinkKey; label: string }) {
  return <span className={`status-pill state-${state}`}><span className="status-dot" aria-hidden/>{label}</span>;
}
/**
 * Carga de batería ESTIMADA a partir del voltaje: no es una medición directa de carga.
 * Sin valor no se dibuja barra (una barra al 0 % sería una cifra inventada).
 */
export function BatteryEstimate({ value, size = 'normal' }: { value: number | null | undefined; size?: 'normal' | 'feature' }) {
  const known = value != null && Number.isFinite(value);
  return <div className={`battery ${size === 'feature' ? 'feature' : ''}`}>
    <div className="battery-track" role={known ? 'meter' : undefined} aria-label="Carga estimada de la batería" aria-valuemin={0} aria-valuemax={100} aria-valuenow={known ? value : undefined} aria-valuetext={known ? `${number(value, 0)} por ciento estimado` : 'Sin datos'}>{known && <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }}/>}</div>
    <strong>{known ? `${number(value, 0)} %` : NO_DATA}</strong>
  </div>;
}
