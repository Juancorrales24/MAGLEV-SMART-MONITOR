'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getSupabase } from '@/lib/supabase';
import { errorMessage, fresh } from '@/lib/format';
import type { Device, Measurement, TrainStatus, SolarStation } from '@/lib/database.types';
type Feed = { devices: Device[]; deviceId: string; selectDevice: (id: string) => void; measurements: Measurement[]; train: TrainStatus[]; solar: SolarStation[]; loading: boolean; error: string; realtime: string; online: boolean; now: number; lastSync: string | null; refresh: () => Promise<void> };
const Context = createContext<Feed | null>(null);
let channelSequence = 0;
export function TelemetryProvider({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState<Device[]>([]); const [deviceId, selectDevice] = useState('');
  const [measurements, setMeasurements] = useState<Measurement[]>([]); const [train, setTrain] = useState<TrainStatus[]>([]); const [solar, setSolar] = useState<SolarStation[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [realtime, setRealtime] = useState('CONNECTING');
  const [online, setOnline] = useState(true); const [now, setNow] = useState(Date.now()); const [lastSync, setLastSync] = useState<string | null>(null);
  const version = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++version.current; const client = getSupabase();
    try {
      const d = await client.from('devices').select('*').order('created_at');
      if (d.error) throw d.error;
      if (current !== version.current) return;
      setDevices(d.data);
      const selected = d.data.some(x => x.id === deviceId) ? deviceId : (d.data.find(x => x.enabled)?.id ?? d.data[0]?.id ?? '');
      if (selected !== deviceId) { selectDevice(selected); return; }
      if (!selected) { setMeasurements([]); setTrain([]); setSolar([]); setError(''); setLastSync(new Date().toISOString()); return; }
      const [m, t, s] = await Promise.all([
        client.from('measurements').select('*').eq('device_id', selected).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(240),
        client.from('train_status').select('*').eq('device_id', selected).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(240),
        client.from('solar_station').select('*').eq('device_id', selected).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(240)
      ]);
      if (m.error || t.error || s.error) throw m.error || t.error || s.error;
      if (current !== version.current) return;
      setMeasurements(m.data); setTrain(t.data); setSolar(s.data); setError(''); setLastSync(new Date().toISOString());
    } catch (e) { if (current === version.current) setError(errorMessage(e)); }
    finally { if (current === version.current) setLoading(false); }
  }, [deviceId]);
  useEffect(() => {
    setLoading(true); setMeasurements([]); setTrain([]); setSolar([]); setLastSync(null); setError(''); setRealtime('CONNECTING');
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, queueRefresh);
    if (deviceId) for (const table of ['measurements', 'train_status', 'solar_station']) {
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
  return <Context.Provider value={{ devices, deviceId, selectDevice, measurements, train, solar, loading, error, realtime, online, now, lastSync, refresh }}>{children}</Context.Provider>;
}
export function useTelemetry() { const context = useContext(Context); if (!context) throw new Error('Falta TelemetryProvider'); return context; }
export function useLiveState() {
  const f = useTelemetry(); const device = f.devices.find(d => d.id === f.deviceId);
  const receiving = Boolean(device?.enabled && fresh(device.last_seen, f.now));
  return { device, receiving, live: receiving && f.realtime === 'SUBSCRIBED' && f.online && !f.error && fresh(f.lastSync, f.now) };
}
