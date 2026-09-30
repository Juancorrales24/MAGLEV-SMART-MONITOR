'use client';
import { Radio, WifiOff } from 'lucide-react';
import { useTelemetry, useLiveState } from '@/hooks/use-telemetry';
import { dateTime } from '@/lib/format';
import { Badge } from './ui';
export function ConnectionStatus() {
  const feed = useTelemetry(); const { device, live, receiving } = useLiveState();
  const title = !device ? 'Esperando el primer dispositivo' : !device.enabled ? 'Dispositivo inactivo' : !device.last_seen ? 'Esperando la primera lectura' : !receiving ? 'Sin lecturas recientes' : live ? 'Recibiendo datos del sistema' : 'Actualizando por consulta periódica';
  return <div className={`connection-banner ${live ? 'connected' : ''}`}><span className="connection-icon">{live ? <Radio/> : <WifiOff/>}</span><div><strong>{title}</strong><p>{device?.last_seen ? `Última recepción: ${dateTime(device.last_seen)}` : 'El panel se actualizará cuando lleguen datos reales.'}</p></div><Badge tone={live ? 'live' : ''}>{live ? 'EN VIVO' : receiving ? 'CONSULTA' : 'EN ESPERA'}</Badge></div>;
}
