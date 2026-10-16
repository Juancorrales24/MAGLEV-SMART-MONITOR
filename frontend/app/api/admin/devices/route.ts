import { randomBytes, createHash } from 'node:crypto';
import { requireAdmin, readBody, reply, failure, HttpError } from '@/lib/server';
import { newDeviceSchema, updateDeviceSchema } from '@/lib/validation';
export const runtime = 'nodejs';
function newKey() { const token = randomBytes(32).toString('base64url'); return { token, token_hash: createHash('sha256').update(token).digest('hex') }; }
export async function POST(request: Request) {
  try {
    const { client } = await requireAdmin(request); const payload = await readBody(request, newDeviceSchema);
    const { data: device, error } = await client.from('devices').insert(payload).select('*').single(); if (error || !device) throw error;
    const key = newKey(); const result = await client.from('device_credentials').insert({ device_id: device.id, token_hash: key.token_hash });
    if (result.error) { await client.from('devices').delete().eq('id', device.id); throw result.error; }
    return reply({ device, token: key.token }, 201);
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    const { client } = await requireAdmin(request); const payload = await readBody(request, updateDeviceSchema);
    const { data: device, error } = await client.from('devices').select('id').eq('id', payload.id).maybeSingle(); if (error) throw error; if (!device) throw new HttpError(404, 'Dispositivo no encontrado.');
    if (payload.enabled !== undefined) { const { error } = await client.from('devices').update({ enabled: payload.enabled }).eq('id', payload.id); if (error) throw error; }
    if (payload.rotate) { const key = newKey(); const { error } = await client.from('device_credentials').upsert({ device_id: payload.id, token_hash: key.token_hash, updated_at: new Date().toISOString() }); if (error) throw error; return reply({ token: key.token }); }
    return reply({ ok: true });
  } catch (error) { return failure(error); }
}
