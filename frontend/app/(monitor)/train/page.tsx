'use client';
import { useMemo, useState } from 'react';
import { MapPin, Radio, History, Antenna } from 'lucide-react';
import { useTelemetry, useLiveState } from '@/hooks/use-telemetry';
import { PageTitle, Panel, StatCard, LoadingState, Notice, EmptyState } from '@/components/ui';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { StationMap } from '@/components/StationMap';
import { TrainEvents } from '@/components/TrainEvents';
import { TelemetryChart } from '@/components/TelemetryChart';
import { activeStation, lapStats, lastDetection, segmentStats, sensorEvents, shownDetection, stationName, stationViews, STATION_POSITIONS, DETECTION_HOLD_MS } from '@/lib/train-state';
import { dateTime, formatSpeed, number, relativeAge, NO_DATA } from '@/lib/format';
export default function Train() {
  const f = useTelemetry(); const { device, link } = useLiveState(); const [station, setStation] = useState('');
  const views = useMemo(() => stationViews(f.train, f.stations), [f.train, f.stations]);
  const events = useMemo(() => sensorEvents(f.train), [f.train]);
  const segments = useMemo(() => segmentStats(f.train, f.stations), [f.train, f.stations]);
  const laps = useMemo(() => lapStats(f.train), [f.train]);
  // Serie para la gráfica: cada registro de vuelta, en segundos, con su hora de recepción.
  const lapSeries = useMemo(() => f.train.filter(r => r.detected === true && r.lap_ms != null).map(r => ({ created_at: r.created_at, lap_s: (r.lap_ms as number) / 1000 })), [f.train]);
  const anyInterval = segments.some(s => s.count > 0) || laps.count > 0;
  const active = activeStation(views); const shown = shownDetection(views, f.heldStation);
  const last = lastDetection(f.train);
  const lastView = last?.station_number == null ? null : views.find(v => v.position === last.station_number) ?? null;
  const filtered = station ? events.filter(e => e.station_number === Number(station)) : events;
  return <>
    <PageTitle eyebrow="SUBSISTEMA / 01" title="Vía y estaciones" description="Detección del tren mediante tres sensores infrarrojos, uno por estación."/>
    <ConnectionStatus/>
    {f.loading ? <LoadingState/> : <>
      {active && !link.ok && <Notice>El estado de detección corresponde al último evento recibido. No hay comunicación reciente con el ESP32, así que puede haber cambiado sin que el panel lo sepa.</Notice>}
      <div className="metrics-grid">
        <StatCard label="Detección activa" icon={Radio} accent="red" tone={shown ? 'on' : 'off'}
          value={shown ? shown.view.name : 'Sin detección activa'}
          detail={!shown ? 'Ningún sensor reporta presencia del tren en este momento.'
            : shown.held ? `Paso recién detectado; el sensor ya quedó libre. Se mantiene visible ${DETECTION_HOLD_MS / 1000} s, como en la pantalla LCD.`
            : `Evento de llegada: ${dateTime(shown.view.lastEvent?.created_at)}`}/>
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
        <div className="panel-body"><StationMap views={views} lastOverall={lastView} now={f.now} held={f.heldStation}/></div>
      </Panel>
      <div className="two-columns">
        <Panel title="Tiempo de vuelta" subtitle="Medido por el ESP32 con su reloj interno entre dos llegadas consecutivas a una misma estación; cada vuelta aporta hasta tres registros, uno por estación.">
          <dl className="settings-list">
            <div><dt>Última vuelta</dt><dd>{laps.lastMs != null ? `${number(laps.lastMs / 1000, 2)} s` : NO_DATA}</dd></div>
            <div><dt>Promedio de la ventana cargada</dt><dd>{laps.meanMs != null ? `${number(laps.meanMs / 1000, 2)} s` : NO_DATA}</dd></div>
            <div><dt>Vuelta más rápida de la ventana</dt><dd>{laps.bestMs != null ? `${number(laps.bestMs / 1000, 2)} s` : NO_DATA}</dd></div>
            <div><dt>Registros de vuelta cargados</dt><dd>{laps.count}</dd></div>
          </dl>
          <TelemetryChart data={lapSeries} field="lap_s" label="Tiempo de vuelta" unit="s" color="#5B8FD4"/>
        </Panel>
        <Panel title="Rapidez media por tramo" subtitle="Tiempo medido por el ESP32; la rapidez solo aparece en los tramos con distancia medida (Configuración → Estaciones de la vía).">
          {!anyInterval ? <EmptyState compact title="Sin intervalos medidos todavía" description="Cada llegada enviada por el firmware actualizado trae el tiempo desde la estación anterior. Deja el tren dando vueltas para ver tiempos y, con las distancias medidas, la rapidez media."/> :
          <div className="table-scroll"><table>
            <caption className="sr-only">Tiempos y rapidez media por tramo del circuito</caption>
            <thead><tr><th scope="col">Tramo</th><th scope="col">Distancia</th><th scope="col">Último tiempo</th><th scope="col">Rapidez última</th><th scope="col">Rapidez promedio</th></tr></thead>
            <tbody>{segments.map(s => <tr key={s.from}>
              <td>{stationName(f.stations, s.from)} → {stationName(f.stations, s.to)}</td>
              <td className="mono">{s.distanceM != null ? `${number(s.distanceM, 2)} m` : 'Sin medir'}</td>
              <td className="mono">{s.lastMs != null ? `${number(s.lastMs / 1000, 2)} s` : NO_DATA}</td>
              <td className="mono">{formatSpeed(s.lastSpeedMs) ?? NO_DATA}</td>
              <td className="mono">{formatSpeed(s.meanSpeedMs) ?? NO_DATA}</td>
            </tr>)}</tbody>
          </table></div>}
        </Panel>
      </div>
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
