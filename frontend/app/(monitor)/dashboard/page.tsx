'use client';
import { useMemo } from 'react';
import { MapPin, Radio, Sun, BatteryCharging, Gauge, Antenna, Activity } from 'lucide-react';
import { useTelemetry, useLiveState } from '@/hooks/use-telemetry';
import { PageTitle, Panel, MetricCard, StatCard, StatusPill, MiniLink, LoadingState } from '@/components/ui';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { TrainEvents } from '@/components/TrainEvents';
import { SolarTable } from '@/components/SolarTable';
import { lastDetection, sensorEvents, shownDetection, stationName, stationViews, DETECTION_HOLD_MS } from '@/lib/train-state';
import { dateTime, relativeAge, NO_DATA } from '@/lib/format';
export default function Dashboard() {
  const f = useTelemetry(); const { device, link } = useLiveState(); const s = f.solar[0];
  const views = useMemo(() => stationViews(f.train, f.stations), [f.train, f.stations]);
  const events = useMemo(() => sensorEvents(f.train), [f.train]);
  const shown = shownDetection(views, f.heldStation); const last = lastDetection(f.train);
  return <>
    <PageTitle eyebrow="CENTRO DE CONTROL" title="Vista general" description="Detección del tren por estación y energía de la estación solar."/>
    <ConnectionStatus/>
    {f.loading ? <LoadingState/> : <>
      <div className="metrics-grid">
        <StatCard label="Última estación detectada" icon={MapPin} accent="red"
          value={last?.station_number ? stationName(f.stations, last.station_number) : NO_DATA}
          detail={last ? `${dateTime(last.created_at)} · ${relativeAge(last.created_at, f.now)}` : 'Todavía no se ha registrado ninguna llegada.'}/>
        <StatCard label="Estado de la detección" icon={Radio} accent="navy" tone={shown ? 'on' : 'off'}
          value={shown ? 'Tren detectado' : 'Sin detección activa'}
          detail={!shown ? 'Ningún sensor reporta presencia del tren ahora mismo.'
            : shown.held ? `Paso recién detectado en ${shown.view.name}; visible ${DETECTION_HOLD_MS / 1000} s, como en la pantalla LCD.`
            : `Sensor activo en ${shown.view.name}.`}/>
        <MetricCard label="Voltaje del panel" value={s?.panel_voltage} unit="V" icon={Sun} accent="navy"
          detail={s?.panel_voltage == null ? `${NO_DATA}: sin lectura del panel.` : `Medido ${dateTime(s.created_at)}`}/>
        <MetricCard label="Voltaje de la batería" value={s?.battery_voltage} unit="V" icon={BatteryCharging} accent="navy"
          detail={s?.battery_voltage == null ? `${NO_DATA}: sin lectura de la batería.` : `Medido ${dateTime(s.created_at)}`}/>
      </div>
      <div className="metrics-grid three top-gap">
        <MetricCard label="Carga estimada de la batería" value={s?.battery_level} unit="%" icon={Gauge} accent="navy" digits={0}
          detail="Estimación a partir del voltaje, no una medición directa de carga."/>
        <StatCard label="Última comunicación del ESP32" icon={Antenna} accent="navy"
          value={device?.last_seen ? dateTime(device.last_seen) : NO_DATA}
          detail={device?.last_seen ? `${relativeAge(device.last_seen, f.now)} · hora de recepción, no la hora actual.` : 'El dispositivo todavía no ha enviado ninguna comunicación.'}/>
        <StatCard label="Estado de comunicación" icon={Activity} accent="navy" tone={link.ok ? 'on' : 'off'}
          value={<StatusPill state={link.key} label={link.label}/>} detail={link.detail}/>
      </div>
      <div className="two-columns top-gap">
        <Panel title="Últimas detecciones" subtitle="Llegadas y salidas registradas por los sensores" action={<MiniLink href="/train">Ver vía y estaciones</MiniLink>}>
          <TrainEvents rows={events.slice(0, 6)} stations={f.stations} devices={f.devices} showReceipt={false}/>
        </Panel>
        <Panel title="Mediciones solares recientes" subtitle="Voltajes almacenados en Supabase" action={<MiniLink href="/solar">Ver estación solar</MiniLink>}>
          <SolarTable rows={f.solar.slice(0, 6)}/>
        </Panel>
      </div>
    </>}
  </>;
}
