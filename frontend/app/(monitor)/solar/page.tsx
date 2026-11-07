'use client';
import { Sun, BatteryCharging, Gauge, Antenna } from 'lucide-react';
import { useTelemetry, useLiveState } from '@/hooks/use-telemetry';
import { PageTitle, Panel, MetricCard, StatCard, BatteryEstimate, LoadingState, EmptyState } from '@/components/ui';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { TelemetryChart } from '@/components/TelemetryChart';
import { SolarTable } from '@/components/SolarTable';
import { dateTime, relativeAge, number, NO_DATA } from '@/lib/format';
export default function Solar() {
  const f = useTelemetry(); const { device, link } = useLiveState(); const s = f.solar[0];
  return <>
    <PageTitle eyebrow="SUBSISTEMA / 02" title="Estación solar" description="Voltaje del panel, voltaje de la batería y carga estimada a partir del voltaje."/>
    <ConnectionStatus/>
    {f.loading ? <LoadingState/> : <>
      <div className="metrics-grid">
          <MetricCard label="Voltaje del panel" value={s?.panel_voltage} unit="V" icon={Sun} accent="red"
            detail={s?.panel_voltage == null ? `${NO_DATA}: sin lectura de voltaje del panel.` : `Medido ${dateTime(s.created_at)} · ${relativeAge(s.created_at, f.now)}`}/>
          <MetricCard label="Voltaje de la batería" value={s?.battery_voltage} unit="V" icon={BatteryCharging} accent="navy"
            detail={s?.battery_voltage == null ? `${NO_DATA}: sin lectura de voltaje de batería.` : `Medido ${dateTime(s.created_at)} · ${relativeAge(s.created_at, f.now)}`}/>
          <MetricCard label="Carga estimada" value={s?.battery_level} unit="%" icon={Gauge} accent="navy" digits={0}
            detail="Estimación calculada a partir del voltaje de la batería. No es una medición directa de carga."/>
          <StatCard label="Última comunicación del ESP32" icon={Antenna} accent="navy" tone={link.ok ? 'on' : 'off'}
            value={device?.last_seen ? relativeAge(device.last_seen, f.now) : NO_DATA}
            detail={device?.last_seen ? `${dateTime(device.last_seen)} · ${link.label}` : link.detail}/>
      </div>
      <p className="section-meta">{s ? `Hora de la medición mostrada: ${dateTime(s.created_at)} (${relativeAge(s.created_at, f.now)}). No es la hora actual.` : 'Todavía no se ha recibido ninguna lectura de la estación solar.'}</p>
      <div className="two-columns">
        <Panel title="Voltaje del panel" subtitle="Registros reales almacenados · V"><TelemetryChart data={f.solar} field="panel_voltage" label="Voltaje del panel" unit="V" color="#D72638"/></Panel>
        <Panel title="Voltaje de la batería" subtitle="Registros reales almacenados · V"><TelemetryChart data={f.solar} field="battery_voltage" label="Voltaje de la batería" unit="V" color="#5B8FD4"/></Panel>
      </div>
      <div className="two-columns">
        <Panel title="Carga estimada de la batería" subtitle="Porcentaje estimado por voltaje · %"><TelemetryChart data={f.solar} field="battery_level" label="Carga estimada" unit="%" color="#E2E8F0" digits={0}/></Panel>
        <Panel title="Estado de la batería" subtitle="Estimación, no medición directa de carga">
          <div className="battery-feature">
            {s?.battery_level == null && s?.battery_voltage == null
              ? <EmptyState compact title="Sin datos de la batería" description="No hay lecturas de voltaje ni de carga estimada todavía."/>
              : <>
                <BatteryEstimate value={s?.battery_level} size="feature"/>
                <p>Carga estimada a partir del voltaje</p>
                <small>Voltaje de la batería: {s?.battery_voltage == null ? NO_DATA : `${number(s.battery_voltage)} V`} · Hora de la lectura: {dateTime(s?.created_at)}</small>
              </>}
          </div>
        </Panel>
      </div>
      <Panel title="Registros de la estación solar" subtitle="Las 15 lecturas más recientes almacenadas en Supabase.">
        <SolarTable rows={f.solar.slice(0, 15)}/>
      </Panel>
    </>}
  </>;
}
