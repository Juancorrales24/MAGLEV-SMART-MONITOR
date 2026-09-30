import type { Measurement, Device } from '@/lib/database.types';
import { number, dateTime } from '@/lib/format';
import { EmptyState } from './ui';
export function DataTable({ rows, devices = [], showDevice = false }: { rows: Measurement[]; devices?: Device[]; showDevice?: boolean }) {
  if (!rows.length) return <EmptyState compact title="No hay mediciones" description="Las lecturas recibidas aparecerán aquí. Si aplicaste filtros, prueba otro intervalo."/>;
  return <div className="table-scroll"><table><caption className="sr-only">Mediciones eléctricas recibidas</caption><thead><tr><th scope="col">Recepción</th>{showDevice && <th scope="col">Dispositivo</th>}<th scope="col">Voltaje (V)</th><th scope="col">Corriente (A)</th><th scope="col">Potencia (W)</th><th scope="col">Energía (Wh)</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td className="mono">{dateTime(r.created_at)}</td>{showDevice && <td>{devices.find(d => d.id === r.device_id)?.name || r.device_id}</td>}<td>{number(r.voltage)}</td><td>{number(r.current)}</td><td className="text-mint">{number(r.power)}</td><td>{number(r.energy)}</td></tr>)}</tbody></table></div>;
}
