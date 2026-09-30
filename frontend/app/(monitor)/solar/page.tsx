'use client';
import { Sun, Activity, Zap, BatteryCharging } from 'lucide-react';
import { useTelemetry } from '@/hooks/use-telemetry';
import { PageTitle, Panel, MetricCard, BatteryIndicator, LoadingState, EmptyState } from '@/components/ui';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { TelemetryChart } from '@/components/TelemetryChart';
import { ModuleVisual } from '@/components/ModuleVisual';
import { dateTime, number } from '@/lib/format';
export default function Solar() {
  const f = useTelemetry(); const s = f.solar[0];
  return <><PageTitle eyebrow="SUBSISTEMA / 02" title="Estación solar" description="Generación fotovoltaica y almacenamiento de energía."/><ConnectionStatus/>{f.loading ? <LoadingState/> : <><div className="module-overview"><ModuleVisual solar/><div className="metrics-grid"><MetricCard label="Voltaje del panel" value={s?.panel_voltage} unit="V" icon={Sun}/><MetricCard label="Corriente del panel" value={s?.panel_current} unit="A" icon={Activity} accent="blue"/><MetricCard label="Potencia de salida" value={s?.power_output} unit="W" icon={Zap} accent="amber"/><MetricCard label="Carga de batería" value={s?.battery_level} unit="%" icon={BatteryCharging} accent="violet"/></div></div><div className="section-meta">Última recepción: {dateTime(s?.created_at)}</div><div className="dashboard-grid"><Panel title="Generación solar" subtitle="Últimas 240 lecturas · W"><TelemetryChart data={f.solar} field="power_output" label="Potencia solar" unit="W" color="#edbb75"/></Panel><Panel title="Almacenamiento" subtitle="Estado de carga reportado por el dispositivo"><div className="battery-feature"><BatteryIndicator value={s?.battery_level}/><p>Capacidad disponible</p><small>{s?.battery_level == null ? 'Esperando información de la batería.' : `Lectura recibida: ${dateTime(s.created_at)}`}</small></div></Panel></div><Panel title="Registros de la estación">{!f.solar.length ? <EmptyState compact/> : <div className="table-scroll"><table><thead><tr><th>Recepción</th><th>Voltaje (V)</th><th>Corriente (A)</th><th>Potencia (W)</th><th>Batería (%)</th></tr></thead><tbody>{f.solar.slice(0, 15).map(r => <tr key={r.id}><td>{dateTime(r.created_at)}</td><td>{number(r.panel_voltage)}</td><td>{number(r.panel_current)}</td><td>{number(r.power_output)}</td><td>{number(r.battery_level)}</td></tr>)}</tbody></table></div>}</Panel></>}</>;
}
