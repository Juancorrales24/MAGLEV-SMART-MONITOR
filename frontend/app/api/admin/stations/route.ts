import { requireAdmin, readBody, reply, failure, HttpError } from '@/lib/server';
import { updateStationSchema } from '@/lib/validation';
export const runtime = 'nodejs';
export async function PATCH(request: Request) {
  try {
    const { client } = await requireAdmin(request); const payload = await readBody(request, updateStationSchema);
    // El firmware identifica la estación por su número de sensor: renombrar solo cambia la etiqueta mostrada.
    const { data: station, error } = await client.from('stations').update({ name: payload.name }).eq('position', payload.position).select('*').maybeSingle();
    if (error) throw error;
    if (!station) throw new HttpError(404, 'Estación no encontrada.');
    return reply({ station });
  } catch (error) { return failure(error); }
}
