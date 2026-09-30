'use client';
import { MoveVertical, Activity, Thermometer } from 'lucide-react';
import { useTelemetry } from '@/hooks/use-telemetry';
import { PageTitle, Panel, MetricCard, LoadingState, EmptyState } from '@/components/ui';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { TelemetryChart } from '@/components/TelemetryChart';
import { ModuleVisual } from '@/components/ModuleVisual';
import { dateTime, number } from '@/lib/format';
export default function Train() {
  const f = useTelemetry(); const t = f.train[0];
  return <><PageTitle eyebrow="SUBSISTEMA / 01" title="Tren Maglev" description="Levitación, estabilidad y temperatura del tren."/><ConnectionStatus/>{f.loading ? <LoadingState/> : <><div className="module-overview"><ModuleVisual /><div className="metrics-grid three"><MetricCard label="Altura de levitación" value={t?.levitation_height} unit="mm" icon={MoveVertical}/><MetricCard label="Estabilidad reportada" value={t?.stability} unit="%" icon={Activity} accent="blue"/><MetricCard label="Temperatura" value={t?.temperature} unit="°C" icon={Thermometer} accent="amber"/></div></div><div className="section-meta">Última recepción: {dateTime(t?.created_at)}</div><div className="two-columns"><Panel title="Altura de levitación" subtitle="Últimas 240 lecturas · mm"><TelemetryChart data={f.train} field="levitation_height" label="Altura" unit="mm"/></Panel><Panel title="Temperatura" subtitle="Últimas 240 lecturas · °C"><TelemetryChart data={f.train} field="temperature" label="Temperatura" unit="°C" color="#edbb75"/></Panel></div><Panel title="Registros del tren" subtitle="La estabilidad es un porcentaje enviado por el controlador.">{!f.train.length ? <EmptyState compact/> : <div className="table-scroll"><table><thead><tr><th>Recepción</th><th>Altura (mm)</th><th>Estabilidad (%)</th><th>Temperatura (°C)</th></tr></thead><tbody>{f.train.slice(0, 15).map(r => <tr key={r.id}><td>{dateTime(r.created_at)}</td><td>{number(r.levitation_height)}</td><td>{number(r.stability)}</td><td>{number(r.temperature)}</td></tr>)}</tbody></table></div>}</Panel></>}</>;
}
