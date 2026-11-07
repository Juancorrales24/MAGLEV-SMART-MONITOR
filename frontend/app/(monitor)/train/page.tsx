'use client';
import { useMemo, useState } from 'react';
import { MapPin, Radio, History, Antenna } from 'lucide-react';
import { useTelemetry, useLiveState } from '@/hooks/use-telemetry';
import { PageTitle, Panel, StatCard, LoadingState, Notice } from '@/components/ui';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { StationMap } from '@/components/StationMap';
import { TrainEvents } from '@/components/TrainEvents';
import { activeStation, lastDetection, sensorEvents, stationName, stationViews, STATION_POSITIONS } from '@/lib/train-state';
import { dateTime, relativeAge, NO_DATA } from '@/lib/format';
export default function Train() {
  const f = useTelemetry(); const { device, link } = useLiveState(); const [station, setStation] = useState('');
  const views = useMemo(() => stationViews(f.train, f.stations), [f.train, f.stations]);
  const events = useMemo(() => sensorEvents(f.train), [f.train]);
  const active = activeStation(views);
  const last = lastDetection(f.train);
  const lastView = last?.station_number == null ? null : views.find(v => v.position === last.station_number) ?? null;
  const filtered = station ? events.filter(e => e.station_number === Number(station)) : events;
  return <>
    <PageTitle eyebrow="SUBSISTEMA / 01" title="Vía y estaciones" description="Detección del tren mediante tres sensores infrarrojos, uno por estación."/>
    <ConnectionStatus/>
    {f.loading ? <LoadingState/> : <>
      {active && !link.ok && <Notice>El estado de detección corresponde al último evento recibido. No hay comunicación reciente con el ESP32, así que puede haber cambiado sin que el panel lo sepa.</Notice>}
      <div className="metrics-grid">
        <StatCard label="Detección activa" icon={Radio} accent="red" tone={active ? 'on' : 'off'}
          value={active ? active.name : 'Sin detección activa'}
          detail={active ? `Evento de llegada: ${dateTime(active.lastEvent?.created_at)}` : 'Ningún sensor reporta presencia del tren en este momento.'}/>
        <StatCard label="Última estación detectada" icon={MapPin} accent="navy"
          value={last?.station_number ? stationName(f.stations, last.station_number) : NO_DATA}
          detail={last ? `${dateTime(last.created_at)} · ${relativeAge(last.created_at, f.now)}` : 'Todavía no se ha registrado ninguna llegada.'}/>
        <StatCard label="Eventos en la ventana cargada" icon={History} accent="navy"
          value={String(events.length)}
          detail={events.length ? 'Llegadas y salidas recibidas de los tres sensores.' : 'Todavía no se ha recibido ningún evento de sensor.'}/>
        <StatCard label="Última comunicación del ESP32" icon={Antenna} accent="navy" tone={link.ok ? 'on' : 'off'}
          value={device?.last_seen ? relativeAge(device.last_seen, f.now) : NO_DATA}
          detail={device?.last_seen ? `${dateTime(device.last_seen)} · ${link.label}` : link.detail}/>
      </div>
      <Panel title="Esquema de la vía" subtitle="Estado independiente de cada sensor. Una estación sin evento propio nunca se da por alcanzada.">
        <div className="panel-body"><StationMap views={views} lastOverall={lastView} now={f.now}/></div>
      </Panel>
      <Panel title="Historial de detecciones" subtitle="Llegadas y salidas tal como las reportaron los sensores."
        action={<label className="inline-field">Estación
          <select value={station} onChange={e => setStation(e.target.value)}>
            <option value="">Todas</option>
            {STATION_POSITIONS.map(p => <option key={p} value={p}>{stationName(f.stations, p)}</option>)}
          </select>
        </label>}>
        <TrainEvents rows={filtered.slice(0, 25)} stations={f.stations} devices={f.devices}/>
      </Panel>
    </>}
  </>;
}
