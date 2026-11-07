'use client';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { EmptyState } from './ui';
import { time, number, dateTime } from '@/lib/format';
type Point = { created_at: string; [key: string]: unknown };
/**
 * Serie construida únicamente con registros reales de Supabase: sin curvas de demostración.
 * `connectNulls={false}` deja el hueco cuando falta una lectura en vez de dibujar un cero.
 */
export function TelemetryChart({ data, field, label, unit, color = '#D72638', digits = 2 }: { data: Point[]; field: string; label: string; unit: string; color?: string; digits?: number }) {
  const valid = data.filter(p => typeof p[field] === 'number' && Number.isFinite(p[field] as number));
  if (!valid.length) return <EmptyState title={`Sin lecturas de ${label.toLowerCase()}`} description="La gráfica se construirá con las mediciones reales que envíe el prototipo. No se muestran datos de ejemplo."/>;
  const points = [...data].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)).map(p => ({ ...p, timestamp: Date.parse(p.created_at) }));
  return <><div className="chart" role="img" aria-label={`${label} en ${unit}. ${valid.length} lecturas reales entre ${dateTime(points[0].created_at)} y ${dateTime(points[points.length - 1].created_at)}. Los valores exactos están en la tabla de registros.`}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <AreaChart data={points} margin={{ top: 15, right: 16, left: 0, bottom: 0 }}>
        <defs><linearGradient id={`fill-${field}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.26}/><stop offset="100%" stopColor={color} stopOpacity={0.01}/></linearGradient></defs>
        <CartesianGrid stroke="#24303F" strokeDasharray="3 5" vertical={false}/>
        <XAxis dataKey="timestamp" type="number" domain={['dataMin', 'dataMax']} tickFormatter={v => time(new Date(Number(v)).toISOString())} tick={{ fill: '#9CA3AF', fontSize: 12 }} minTickGap={65} tickLine={false} axisLine={false}/>
        <YAxis tick={{ fill: '#9CA3AF', fontSize: 12 }} width={55} tickLine={false} axisLine={false} tickFormatter={v => number(Number(v), digits > 1 ? 1 : digits)}/>
        <Tooltip contentStyle={{ background: '#182334', border: '1px solid #33445C', borderRadius: 10, color: '#F8FAFC' }} labelFormatter={v => dateTime(new Date(Number(v)).toISOString())} formatter={v => [`${number(Number(v), digits)} ${unit}`, label]}/>
        {/* Con una sola lectura válida la línea no se ve: el punto la mantiene visible. */}
        <Area type="linear" dataKey={field} stroke={color} strokeWidth={2} fill={`url(#fill-${field})`} connectNulls={false} dot={valid.length === 1} isAnimationActive={false}/>
      </AreaChart>
    </ResponsiveContainer>
  </div>
  {valid.length === 1 && <p className="chart-note">Datos insuficientes para trazar una evolución: por ahora solo hay una lectura válida ({number(valid[0][field] as number, digits)} {unit} · {dateTime(valid[0].created_at)}).</p>}
  </>;
}
