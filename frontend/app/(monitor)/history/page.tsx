'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Download, ChevronLeft, ChevronRight, ArrowDownUp, Search } from 'lucide-react';
import { useTelemetry } from '@/hooks/use-telemetry';
import { queryTrainHistory, querySolarHistory, PAGE_SIZE, type TrainFilter } from '@/lib/queries';
import { errorMessage, toCsv, dateOnly, clock } from '@/lib/format';
import { eventKindLabel, stationName, STATION_POSITIONS } from '@/lib/train-state';
import type { SolarStation, TrainStatus } from '@/lib/database.types';
import { PageTitle, Panel, Notice, LoadingState } from '@/components/ui';
import { TrainEvents } from '@/components/TrainEvents';
import { SolarTable } from '@/components/SolarTable';
type Source = 'train' | 'solar';
const empty: TrainFilter = { deviceId: '', station: '', from: '', to: '', ascending: false };
export default function HistoryPage() {
  const { devices, stations } = useTelemetry();
  const [source, setSource] = useState<Source>('train');
  const [draft, setDraft] = useState(empty); const [filter, setFilter] = useState(empty);
  const [page, setPage] = useState(0); const [train, setTrain] = useState<TrainStatus[]>([]); const [solar, setSolar] = useState<SolarStation[]>([]); const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [reload, setReload] = useState(0); const version = useRef(0);
  useEffect(() => {
    const current = ++version.current; setLoading(true); setError(''); setTrain([]); setSolar([]);
    const request = source === 'train' ? queryTrainHistory(filter, page) : querySolarHistory(filter, page);
    request
      .then(data => { if (current !== version.current) return; setCount(data.count); if (source === 'train') setTrain(data.rows as TrainStatus[]); else setSolar(data.rows as SolarStation[]); })
      .catch(e => { if (current === version.current) { setError(errorMessage(e)); setCount(0); } })
      .finally(() => { if (current === version.current) setLoading(false); });
    return () => { ++version.current; };
  }, [filter, page, reload, source]);
  function apply(event: FormEvent) { event.preventDefault(); if (draft.from && draft.to && draft.from > draft.to) { setError('La fecha inicial debe ser anterior a la fecha final.'); return; } setPage(0); setFilter({ ...draft }); }
  function switchSource(next: Source) { if (next === source) return; setSource(next); setPage(0); setError(''); }
  function exportPage() {
    const text = source === 'train'
      ? toCsv(['Fecha', 'Hora', 'Recepción UTC', 'Muestreo UTC', 'Estación', 'Evento', 'Dispositivo'],
        train.map(r => [dateOnly(r.created_at), clock(r.created_at), r.created_at, r.sampled_at, r.station_number == null ? 'Sin datos' : stationName(stations, r.station_number), eventKindLabel(r), devices.find(d => d.id === r.device_id)?.name || r.device_id]))
      : toCsv(['Fecha', 'Hora', 'Recepción UTC', 'Muestreo UTC', 'Dispositivo', 'Voltaje panel V', 'Voltaje batería V', 'Carga estimada %'],
        solar.map(r => [dateOnly(r.created_at), clock(r.created_at), r.created_at, r.sampled_at, devices.find(d => d.id === r.device_id)?.name || r.device_id, r.panel_voltage, r.battery_voltage, r.battery_level]));
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `maglev-${source === 'train' ? 'detecciones' : 'solar'}-pagina-${page + 1}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const rows = source === 'train' ? train.length : solar.length;
  return <>
    <PageTitle eyebrow="REGISTRO DE ACTIVIDAD" title="Historial" description="Consulta y exporta los eventos de detección y las lecturas solares almacenadas."
      actions={<button className="button" onClick={exportPage} disabled={!rows || loading}><Download size={17} aria-hidden/>Exportar esta página</button>}/>
    <div className="segmented" role="group" aria-label="Origen del historial">
      <button type="button" aria-pressed={source === 'train'} onClick={() => switchSource('train')}>Detecciones del tren</button>
      <button type="button" aria-pressed={source === 'solar'} onClick={() => switchSource('solar')}>Estación solar</button>
    </div>
    <form className="filter-bar" onSubmit={apply}>
      <label>Dispositivo<select value={draft.deviceId} onChange={e => setDraft({ ...draft, deviceId: e.target.value })}><option value="">Todos</option>{devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      {source === 'train' && <label>Estación<select value={draft.station} onChange={e => setDraft({ ...draft, station: e.target.value })}><option value="">Todas</option>{STATION_POSITIONS.map(p => <option key={p} value={p}>{stationName(stations, p)}</option>)}</select></label>}
      <label>Desde<input type="datetime-local" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })}/></label>
      <label>Hasta<input type="datetime-local" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })}/></label>
      <button className="button primary" type="submit"><Search size={17} aria-hidden/>Filtrar</button>
      <button className="button" type="button" onClick={() => { setDraft(empty); setFilter(empty); setPage(0); setReload(x => x + 1); }}>Limpiar</button>
    </form>
    {error && <Notice tone="error">{error}</Notice>}
    <Panel title={`${count.toLocaleString('es-CO')} registros`} subtitle="El archivo CSV incluye únicamente las filas de la página visible."
      action={<button className="button small" onClick={() => { const next = { ...filter, ascending: !filter.ascending }; setFilter(next); setDraft({ ...draft, ascending: next.ascending }); setPage(0); }}><ArrowDownUp size={15} aria-hidden/>{filter.ascending ? 'Antiguos primero' : 'Recientes primero'}</button>}>
      {loading ? <LoadingState/> : source === 'train'
        ? <TrainEvents rows={train} stations={stations} devices={devices}/>
        : <SolarTable rows={solar} devices={devices} showDevice/>}
      <div className="pagination">
        <span>Página {page + 1} de {Math.max(1, Math.ceil(count / PAGE_SIZE))}</span>
        <div>
          <button className="button small" aria-label="Página anterior" disabled={loading || page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={17} aria-hidden/>Anterior</button>
          <button className="button small" aria-label="Página siguiente" disabled={loading || (page + 1) * PAGE_SIZE >= count} onClick={() => setPage(p => p + 1)}>Siguiente<ChevronRight size={17} aria-hidden/></button>
        </div>
      </div>
    </Panel>
  </>;
}
