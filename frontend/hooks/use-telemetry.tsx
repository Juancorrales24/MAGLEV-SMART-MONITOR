'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getSupabase } from '@/lib/supabase';
import { errorMessage, fresh, STALE_SECONDS } from '@/lib/format';
import { linkState, lastDetection, DETECTION_HOLD_MS } from '@/lib/train-state';
import type { Device, DeviceHealth, Measurement, TrainStatus, SolarStation, Station } from '@/lib/database.types';
type Feed = { devices: Device[]; deviceId: string; selectDevice: (id: string) => void; stations: Station[]; measurements: Measurement[]; train: TrainStatus[]; heldStation: number | null; solar: SolarStation[]; health: DeviceHealth[]; loading: boolean; error: string; realtime: string; online: boolean; now: number; lastSync: string | null; refresh: () => Promise<void> };
const Context = createContext<Feed | null>(null);
let channelSequence = 0;
export function TelemetryProvider({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState<Device[]>([]); const [deviceId, selectDevice] = useState('');
  // Los nombres de las estaciones son globales (tabla `stations`), no dependen del dispositivo seleccionado.
  const [stations, setStations] = useState<Station[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]); const [train, setTrain] = useState<TrainStatus[]>([]); const [solar, setSolar] = useState<SolarStation[]>([]); const [health, setHealth] = useState<DeviceHealth[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [realtime, setRealtime] = useState('CONNECTING');
  const [online, setOnline] = useState(true); const [now, setNow] = useState(Date.now()); const [lastSync, setLastSync] = useState<string | null>(null);
  const version = useRef(0);
  // Retención visual de una llegada recién recibida (ver DETECTION_HOLD_MS). Se cuenta desde que el
  // navegador VE el evento nuevo, no desde su created_at: así la duración no depende de que el reloj
  // del equipo coincida con el del servidor. `undefined` = todavía no hubo primera carga del dispositivo.
  const [heldStation, setHeldStation] = useState<number | null>(null);
  const lastArrival = useRef<TrainStatus['id'] | null | undefined>(undefined);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (loading) { lastArrival.current = undefined; clearTimeout(holdTimer.current); setHeldStation(null); return; }
    const latest = lastDetection(train); const id = latest?.id ?? null;
    // Primera carga: lo que ya estaba almacenado no es un paso recién ocurrido.
    if (lastArrival.current === undefined) { lastArrival.current = id; return; }
    if (id === lastArrival.current) return;
    lastArrival.current = id;
    // Solo se retiene un evento reciente: tras un error de carga o al despertar el equipo, la última
    // llegada almacenada puede ser antigua y no debe presentarse como un paso recién ocurrido.
    // La tolerancia es amplia (STALE_SECONDS, en ambos sentidos) para admitir un reloj local desajustado.
    if (latest?.station_number == null || Math.abs(Date.now() - Date.parse(latest.created_at)) >= STALE_SECONDS * 1000) return;
    clearTimeout(holdTimer.current);
    setHeldStation(latest.station_number);
    holdTimer.current = setTimeout(() => setHeldStation(null), DETECTION_HOLD_MS);
  }, [train, loading]);
  useEffect(() => () => clearTimeout(holdTimer.current), []);
  const refresh = useCallback(async () => {
    const current = ++version.current; const client = getSupabase();
    try {
      // `stations` se consulta junto a `devices` para que los nombres estén disponibles incluso
      // antes de elegir dispositivo y sin repetir la consulta por cada cambio de selección.
      const [d, st] = await Promise.all([
        client.from('devices').select('*').order('created_at'),
        client.from('stations').select('*').order('position')
      ]);
      if (d.error || st.error) throw d.error || st.error;
      if (current !== version.current) return;
      setDevices(d.data); setStations(st.data);
      const selected = d.data.some(x => x.id === deviceId) ? deviceId : (d.data.find(x => x.enabled)?.id ?? d.data[0]?.id ?? '');
      if (selected !== deviceId) { selectDevice(selected); return; }
      if (!selected) { setMeasurements([]); setTrain([]); setSolar([]); setHealth([]); setError(''); setLastSync(new Date().toISOString()); return; }
      const [m, t, s, h] = await Promise.all([
        client.from('measurements').select('*').eq('device_id', selected).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(240),
        client.from('train_status').select('*').eq('device_id', selected).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(240),
        client.from('solar_station').select('*').eq('device_id', selected).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(240),
        // Una muestra de salud cada ~30 s: 240 filas cubren unas 2 horas de funcionamiento.
        client.from('device_health').select('*').eq('device_id', selected).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(240)
      ]);
      if (m.error || t.error || s.error || h.error) throw m.error || t.error || s.error || h.error;
      if (current !== version.current) return;
      setMeasurements(m.data); setTrain(t.data); setSolar(s.data); setHealth(h.data); setError(''); setLastSync(new Date().toISOString());
    } catch (e) { if (current === version.current) setError(errorMessage(e)); }
    finally { if (current === version.current) setLoading(false); }
  }, [deviceId]);
  useEffect(() => {
    setLoading(true); setMeasurements([]); setTrain([]); setSolar([]); setHealth([]); setLastSync(null); setError(''); setRealtime('CONNECTING');
    // `active` evita que eventos o estados tardíos del canal anterior (p. ej. CLOSED al terminar su salida)
    // sobrescriban el estado del canal nuevo o programen consultas con el dispositivo anterior.
    const client = getSupabase(); let timer: ReturnType<typeof setTimeout> | undefined; let active = true;
    // Una sola consulta automática a la vez: cada refresh invalida al anterior, así que con lecturas cada
    // segundo y una red lenta las consultas se descartaban entre sí y la vista nunca se actualizaba.
    let running = false; let again = false;
    const run = async () => {
      if (!active) return; if (running) { again = true; return; }
      running = true;
      try { await refresh(); } finally { running = false; if (again && active) { again = false; void run(); } }
    };
    void run();
    const queueRefresh = () => { if (!active || timer) return; timer = setTimeout(() => { timer = undefined; void run(); }, 350); };
    // Tema único por suscripción: supabase-js reutiliza un canal con el mismo tema mientras aún se está cerrando,
    // lo que dejaba la nueva suscripción sin callbacks (StrictMode o cambio rápido A → B → A).
    let channel = client.channel(`telemetry-${deviceId || 'none'}-${++channelSequence}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, queueRefresh)
      // `stations` es global: se escucha sin filtro de dispositivo para que un renombrado se refleje al instante.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stations' }, queueRefresh);
    if (deviceId) for (const table of ['measurements', 'train_status', 'solar_station', 'device_health']) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `device_id=eq.${deviceId}` }, queueRefresh);
    }
    channel.subscribe(status => { if (!active) return; setRealtime(status); if (status === 'SUBSCRIBED') queueRefresh(); });
    const interval = setInterval(() => { void run(); }, 15000);
    return () => { active = false; ++version.current; clearInterval(interval); clearTimeout(timer); void client.removeChannel(channel); };
  }, [deviceId, refresh]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener('online', update); window.addEventListener('offline', update);
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => { clearInterval(interval); window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return <Context.Provider value={{ devices, deviceId, selectDevice, stations, measurements, train, heldStation, solar, health, loading, error, realtime, online, now, lastSync, refresh }}>{children}</Context.Provider>;
}
export function useTelemetry() { const context = useContext(Context); if (!context) throw new Error('Falta TelemetryProvider'); return context; }
export function useLiveState() {
  const f = useTelemetry(); const device = f.devices.find(d => d.id === f.deviceId);
  const receiving = Boolean(device?.enabled && fresh(device.last_seen, f.now));
  const link = linkState({ hasDevices: f.devices.length > 0, enabled: device?.enabled, lastSeen: device?.last_seen, receiving, error: f.error, online: f.online, staleSeconds: STALE_SECONDS });
  return { device, receiving, link, live: receiving && f.realtime === 'SUBSCRIBED' && f.online && !f.error && fresh(f.lastSync, f.now) };
}
