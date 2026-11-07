'use client';
import { MapPin, Radio, History, CircleSlash } from 'lucide-react';
import type { StationView } from '@/lib/train-state';
import { dateTime, relativeAge, NO_DATA } from '@/lib/format';

/**
 * Esquema CONCEPTUAL de la vía con las tres estaciones.
 *
 * El prototipo solo sabe lo que reporta cada sensor infrarrojo fijo: no hay sensor de posición,
 * de velocidad ni de sentido de marcha, así que el tren NO se dibuja ni se anima desplazándose
 * entre estaciones. El tramo entre dos estaciones se representa como un segmento de vía sin estado.
 */
export function StationMap({ views, lastOverall, now }: { views: StationView[]; lastOverall: StationView | null; now: number }) {
  return (
    <div className="station-map">
      <p className="station-map-note">Esquema conceptual de la vía. La posición del tren entre estaciones no se mide: solo se muestran los eventos de los tres sensores infrarrojos.</p>
      <ol className="station-track" aria-label="Estado de los tres sensores de estación">
        {views.map((view, index) => {
          const isLast = !view.present && lastOverall?.position === view.position;
          const state = view.present ? 'present' : isLast ? 'last' : view.lastEvent ? 'idle' : 'unknown';
          const status = view.present ? 'Tren detectado' : isLast ? 'Última estación detectada' : view.lastEvent ? 'Sin detección activa' : 'Sin registros de este sensor';
          const Icon = view.present ? Radio : isLast ? History : view.lastEvent ? CircleSlash : MapPin;
          return (
            <li key={view.position} className={`station-node state-${state}`}>
              {index > 0 && <span className="station-rail" aria-hidden/>}
              <div className="station-card">
                <div className="station-head">
                  <span className="station-index" aria-hidden>{view.position}</span>
                  <div>
                    <strong>{view.name}</strong>
                    <small>Sensor infrarrojo {view.position}</small>
                  </div>
                </div>
                <p className="station-status"><Icon size={16} aria-hidden/><span>{status}</span></p>
                <dl className="station-facts">
                  <div><dt>Último evento</dt><dd>{view.lastEvent ? `${dateTime(view.lastEvent.created_at)} · ${relativeAge(view.lastEvent.created_at, now)}` : NO_DATA}</dd></div>
                  <div><dt>Última detección</dt><dd>{view.lastDetection ? `${dateTime(view.lastDetection.created_at)} · ${relativeAge(view.lastDetection.created_at, now)}` : NO_DATA}</dd></div>
                </dl>
              </div>
            </li>
          );
        })}
      </ol>
      <ul className="station-legend">
        <li><span className="legend-chip state-present" aria-hidden/>Detección activa</li>
        <li><span className="legend-chip state-last" aria-hidden/>Última estación detectada</li>
        <li><span className="legend-chip state-idle" aria-hidden/>Sin detección activa</li>
        <li><span className="legend-chip state-unknown" aria-hidden/>Sin registros</li>
      </ul>
    </div>
  );
}
