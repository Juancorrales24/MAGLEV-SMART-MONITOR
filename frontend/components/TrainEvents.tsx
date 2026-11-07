'use client';
import type { Device, Station, TrainStatus } from '@/lib/database.types';
import { dateOnly, clock, dateTime, NO_DATA } from '@/lib/format';
import { eventKind, eventKindLabel, stationName } from '@/lib/train-state';
import { EmptyState, Badge } from './ui';

/**
 * Historial de eventos de los sensores. Cada fila es un evento realmente recibido:
 * no se generan llegadas intermedias ni se completan estaciones sin evento propio.
 */
export function TrainEvents({ rows, stations, devices = [], showReceipt = true }: { rows: TrainStatus[]; stations: Station[]; devices?: Device[]; showReceipt?: boolean }) {
  if (!rows.length) return <EmptyState compact title="Sin eventos de detección" description="Aquí aparecerán las llegadas y salidas registradas por los sensores. Si aplicaste filtros, prueba otro intervalo o estación."/>;
  return <div className="table-scroll"><table>
    <caption className="sr-only">Eventos de detección registrados por los sensores infrarrojos</caption>
    <thead><tr><th scope="col">Fecha</th><th scope="col">Hora</th><th scope="col">Estación</th><th scope="col">Evento</th><th scope="col">Dispositivo</th>{showReceipt && <th scope="col">Recepción</th>}</tr></thead>
    <tbody>{rows.map(r => {
      const kind = eventKind(r);
      return <tr key={r.id}>
        <td className="mono">{dateOnly(r.created_at)}</td>
        <td className="mono">{clock(r.created_at)}</td>
        <td>{r.station_number == null ? NO_DATA : stationName(stations, r.station_number)}</td>
        <td><Badge tone={kind === 'arrival' ? 'live' : kind === 'departure' ? 'muted' : ''}>{eventKindLabel(r)}</Badge></td>
        <td>{devices.find(d => d.id === r.device_id)?.name || r.device_id}</td>
        {showReceipt && <td className="mono">{r.sampled_at ? `Muestreo ${dateTime(r.sampled_at)}` : `Recibido ${dateTime(r.created_at)}`}</td>}
      </tr>;
    })}</tbody>
  </table></div>;
}
