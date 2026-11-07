import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { serviceClient, readBody, reply, failure, HttpError } from '@/lib/server';
import { telemetrySchema } from '@/lib/validation';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const deviceId = request.headers.get('x-device-id'); const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    if (!z.uuid().safeParse(deviceId).success || !token || token.length > 256) throw new HttpError(401, 'Credenciales del dispositivo inválidas.');
    const client = serviceClient();
    // Un fallo de la base no es una credencial inválida: debe responder 5xx para que el ESP32
    // conserve y reintente la muestra (ante 401 la descarta).
    const { data: credential, error } = await client.from('device_credentials').select('token_hash').eq('device_id', deviceId!).maybeSingle();
    if (error) throw error;
    const hash = createHash('sha256').update(token).digest();
    const stored = Buffer.from(credential?.token_hash || '', 'hex');
    if (!credential || hash.length !== stored.length || !timingSafeEqual(hash, stored)) throw new HttpError(401, 'Credenciales del dispositivo inválidas.');
    const payload = await readBody(request, telemetrySchema);
    const { data, error: ingestError } = await client.rpc('ingest_telemetry', {
      p_device_id: deviceId!, p_sample_id: payload.sample_id, p_sampled_at: payload.sampled_at ?? null,
      p_measurements: payload.measurements ?? null, p_train: payload.train_status ?? null, p_solar: payload.solar_station ?? null
    });
    if (ingestError) {
      if (ingestError.message.includes('device_disabled')) throw new HttpError(403, 'Dispositivo inactivo.');
      if (ingestError.message.includes('rate_limit')) throw new HttpError(429, 'Espera al menos un segundo entre mensajes.');
      // Rechazos definitivos del contenido: 4xx para que el emisor no reintente indefinidamente.
      if (ingestError.message.includes('future_timestamp')) throw new HttpError(400, 'La fecha de muestreo no puede estar más de cinco minutos en el futuro.');
      if (ingestError.message.includes('empty_payload')) throw new HttpError(400, 'Incluye un bloque con mediciones.');
      if (ingestError.code === '23514') throw new HttpError(400, 'Una lectura está fuera del rango permitido.');
      throw ingestError;
    }
    return reply({ ok: true, duplicate: !data }, data ? 201 : 200);
  } catch (error) { return failure(error); }
}
