'use client';
import { useTelemetry, useLiveState } from '@/hooks/use-telemetry';
import { PageTitle, Panel, Badge, LoadingState } from '@/components/ui';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { TelemetryChart } from '@/components/TelemetryChart';
import { DataTable } from '@/components/DataTable';
import { dateTime, STALE_SECONDS } from '@/lib/format';
export default function Monitoring() {
  const f = useTelemetry(); const { device, live } = useLiveState();
  return <><PageTitle eyebrow="ADQUISICIÓN CONTINUA" title="Monitoreo en tiempo real" description="Las nuevas lecturas se incorporan automáticamente." actions={<Badge tone={live ? 'live' : ''}>{live ? '● LIVE' : 'EN ESPERA'}</Badge>}/><ConnectionStatus/><div className="connection-details"><div><span>Canal de actualización</span><strong>{!f.online ? 'Sin Internet' : f.realtime === 'SUBSCRIBED' ? 'Conectado' : 'Reconectando · consulta cada 15 s'}</strong></div><div><span>Última recepción del dispositivo</span><strong>{dateTime(device?.last_seen)}</strong></div><div><span>Tiempo sin lecturas para desconexión</span><strong>{STALE_SECONDS} segundos</strong></div></div>{f.loading ? <LoadingState/> : <><div className="two-columns"><Panel title="Voltaje" subtitle="Ventana de las últimas 240 mediciones"><TelemetryChart data={f.measurements} field="voltage" label="Voltaje" unit="V"/></Panel><Panel title="Corriente" subtitle="Ventana de las últimas 240 mediciones"><TelemetryChart data={f.measurements} field="current" label="Corriente" unit="A" color="#8bbcff"/></Panel></div><Panel title="Flujo de mediciones" subtitle="Las 25 lecturas eléctricas más recientes"><DataTable rows={f.measurements.slice(0, 25)}/></Panel></>}</>;
}
