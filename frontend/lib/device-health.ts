// Derivaciones puras de la salud reportada por el propio ESP32: nada se mide aquí.
import type { DeviceHealth } from './database.types';

/** Etiquetas de los motivos de arranque que envía el firmware (motivoReinicio() en MaglevSender.ino). */
const REASONS: Record<string, string> = {
  alimentacion: 'Encendido o corte de alimentación',
  brownout: 'Caída de voltaje (brownout): revisar la fuente',
  software: 'Reinicio por software',
  watchdog: 'Watchdog: el programa dejó de responder',
  panic: 'Error del programa (panic)',
  externo: 'Botón de reset',
  deepsleep: 'Salida de suspensión profunda',
  desconocido: 'Motivo no identificado'
};
export function resetReasonLabel(reason: string | null | undefined) {
  if (!reason) return 'Sin datos';
  return REASONS[reason] ?? reason;
}

/** `rows` llega de la consulta ordenada de más reciente a más antigua. */
export function latestHealth(rows: DeviceHealth[]) { return rows[0] ?? null; }

/**
 * Reinicios visibles en la ventana cargada: el tiempo encendido deja de crecer entre dos
 * muestras consecutivas. Es un mínimo: varios reinicios entre dos muestras cuentan como uno.
 */
export function restartsInWindow(rows: DeviceHealth[]) {
  const asc = rows.filter(r => r.uptime_s != null).slice().reverse();
  let restarts = 0;
  for (let i = 1; i < asc.length; i++) if ((asc[i].uptime_s as number) < (asc[i - 1].uptime_s as number)) restarts++;
  return restarts;
}

export function formatUptime(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const s = Math.floor(seconds);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`;
  const h = Math.floor(s / 3600);
  if (h < 48) return `${h} h ${Math.floor((s % 3600) / 60)} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}
