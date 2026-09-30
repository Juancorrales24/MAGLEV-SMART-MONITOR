import { requireAdmin, readBody, reply, failure, HttpError } from '@/lib/server';
import { newUserSchema, updateUserSchema } from '@/lib/validation';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { const { client } = await requireAdmin(request); const { data, error } = await client.from('profiles').select('*').order('created_at'); if (error) throw error; return reply({ users: data }); } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const { client } = await requireAdmin(request); const payload = await readBody(request, newUserSchema);
    const { data, error } = await client.auth.admin.createUser({ email: payload.email, password: payload.password, email_confirm: true, user_metadata: { name: payload.name } });
    if (error || !data.user) throw new HttpError(400, 'No se pudo crear la cuenta. Comprueba si el correo ya está registrado y revisa la política de contraseñas.');
    const result = await client.from('profiles').update({ name: payload.name, role: payload.role, active: true }).eq('id', data.user.id).select('id').single();
    if (result.error || !result.data) { await client.auth.admin.deleteUser(data.user.id); throw new HttpError(500, 'No se creó el perfil. Verifica los scripts SQL y vuelve a intentarlo.'); }
    return reply({ id: data.user.id }, 201);
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    const { client, user } = await requireAdmin(request); const payload = await readBody(request, updateUserSchema);
    const { error } = await client.rpc('admin_update_profile', { p_actor: user.id, p_id: payload.id, p_name: payload.name, p_role: payload.role, p_active: payload.active });
    if (error) throw new HttpError(400, 'No se pudo actualizar. No puedes retirar tu propio acceso ni desactivar al último administrador.');
    return reply({ ok: true });
  } catch (error) { return failure(error); }
}
