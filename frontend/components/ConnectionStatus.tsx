'use client';
import { Radio, WifiOff, AlertTriangle, Clock, CircleDashed } from 'lucide-react';
import { useTelemetry, useLiveState } from '@/hooks/use-telemetry';
import { dateTime, relativeAge } from '@/lib/format';
import { StatusPill } from './ui';
/**
 * Un registro antiguo nunca se presenta como recepción en curso: `link` sale de `fresh()`
 * y de STALE_SECONDS, y distingue error, sin dispositivo, sin registros, caducado y reciente.
 */
export function ConnectionStatus() {
  const feed = useTelemetry(); const { device, link } = useLiveState();
  const Icon = link.key === 'error' ? AlertTriangle : link.key === 'offline' ? WifiOff : link.key === 'stale' ? Clock : link.key === 'receiving' ? Radio : CircleDashed;
  return <div className={`connection-banner state-${link.key}`} role={link.key === 'error' ? 'alert' : 'status'}>
    <span className="connection-icon"><Icon aria-hidden/></span>
    <div>
      <strong>{link.label}</strong>
      <p>{link.detail}</p>
      <p className="connection-when">{device?.last_seen ? `Última comunicación del ESP32: ${dateTime(device.last_seen)} · ${relativeAge(device.last_seen, feed.now)}` : 'Aún no se ha recibido ninguna comunicación del ESP32.'}</p>
    </div>
    <StatusPill state={link.key} label={link.ok ? 'RECIBIENDO' : link.key === 'stale' ? 'CADUCADO' : link.key === 'error' || link.key === 'offline' ? 'ERROR' : 'SIN DATOS'}/>
  </div>;
}
