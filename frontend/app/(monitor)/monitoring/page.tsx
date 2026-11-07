'use client';
import { useMemo } from 'react';
import { useTelemetry, useLiveState } from '@/hooks/use-telemetry';
import { PageTitle, Panel, StatusPill, LoadingState } from '@/components/ui';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { TelemetryChart } from '@/components/TelemetryChart';
import { TrainEvents } from '@/components/TrainEvents';
import { SolarTable } from '@/components/SolarTable';
import { sensorEvents } from '@/lib/train-state';
import { dateTime, relativeAge, STALE_SECONDS, NO_DATA } from '@/lib/format';
export default function Monitoring() {
  const f = useTelemetry(); const { device, link } = useLiveState();
  const events = useMemo(() => sensorEvents(f.train), [f.train]);
  return <>
    <PageTitle eyebrow="ADQUISICIÓN CONTINUA" title="Tiempo real" description="Los eventos y lecturas nuevos se incorporan automáticamente."
      actions={<StatusPill state={link.key} label={link.label}/>}/>
    <ConnectionStatus/>
    <div className="connection-details">
      <div><span>Canal de actualización</span><strong>{!f.online ? 'Sin Internet' : f.realtime === 'SUBSCRIBED' ? 'Realtime conectado' : 'Reconectando · consulta cada 15 s'}</strong></div>
      <div><span>Última comunicación del dispositivo</span><strong>{dateTime(device?.last_seen)}{device?.last_seen ? ` · ${relativeAge(device.last_seen, f.now)}` : ''}</strong></div>
      <div><span>Última consulta del panel</span><strong>{f.lastSync ? `${dateTime(f.lastSync)} · ${relativeAge(f.lastSync, f.now)}` : NO_DATA}</strong></div>
      <div><span>Caducidad de la telemetría</span><strong>{STALE_SECONDS} s sin recepción</strong></div>
    </div>
    {f.loading ? <LoadingState/> : <>
      <div className="two-columns">
        <Panel title="Voltaje del panel" subtitle="Ventana de las últimas lecturas recibidas"><TelemetryChart data={f.solar} field="panel_voltage" label="Voltaje del panel" unit="V" color="#D72638"/></Panel>
        <Panel title="Voltaje de la batería" subtitle="Ventana de las últimas lecturas recibidas"><TelemetryChart data={f.solar} field="battery_voltage" label="Voltaje de la batería" unit="V" color="#5B8FD4"/></Panel>
      </div>
      <Panel title="Flujo de detecciones" subtitle="Los 25 eventos de sensor más recientes"><TrainEvents rows={events.slice(0, 25)} stations={f.stations} devices={f.devices}/></Panel>
      <Panel title="Flujo de lecturas solares" subtitle="Las 25 lecturas de voltaje más recientes"><SolarTable rows={f.solar.slice(0, 25)}/></Panel>
    </>}
  </>;
}
