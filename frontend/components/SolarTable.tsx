'use client';
import type { Device, SolarStation } from '@/lib/database.types';
import { dateOnly, clock, number, dateTime } from '@/lib/format';
import { EmptyState } from './ui';

/**
 * Lecturas de la estación solar. Solo se muestran las magnitudes que el prototipo mide:
 * voltaje del panel, voltaje de batería y el porcentaje ESTIMADO a partir del voltaje.
 * No se presentan corriente ni potencia: no hay sensor de corriente en el montaje.
 */
export function SolarTable({ rows, devices = [], showDevice = false }: { rows: SolarStation[]; devices?: Device[]; showDevice?: boolean }) {
  if (!rows.length) return <EmptyState compact title="Sin lecturas solares" description="Las lecturas de voltaje aparecerán cuando la estación solar envíe datos. Si aplicaste filtros, prueba otro intervalo."/>;
  return <div className="table-scroll"><table>
    <caption className="sr-only">Lecturas de voltaje de la estación solar</caption>
    <thead><tr><th scope="col">Fecha</th><th scope="col">Hora</th>{showDevice && <th scope="col">Dispositivo</th>}<th scope="col">Panel (V)</th><th scope="col">Batería (V)</th><th scope="col">Carga estimada (%)</th><th scope="col">Muestreo</th></tr></thead>
    <tbody>{rows.map(r => <tr key={r.id}>
      <td className="mono">{dateOnly(r.created_at)}</td>
      <td className="mono">{clock(r.created_at)}</td>
      {showDevice && <td>{devices.find(d => d.id === r.device_id)?.name || r.device_id}</td>}
      <td className="accent">{number(r.panel_voltage)}</td>
      <td>{number(r.battery_voltage)}</td>
      <td>{number(r.battery_level, 0)}</td>
      <td className="mono">{r.sampled_at ? dateTime(r.sampled_at) : '—'}</td>
    </tr>)}</tbody>
  </table></div>;
}
