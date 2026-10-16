import { requireAdmin, readBody, reply, failure, HttpError, authUnavailable } from '@/lib/server';
import { newUserSchema, updateUserSchema } from '@/lib/validation';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { const { client } = await requireAdmin(request); const { data, error } = await client.from('profiles').select('*').order('created_at'); if (error) throw error; return reply({ users: data }); } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const { client } = await requireAdmin(request); const payload = await readBody(request, newUserSchema);
    const { data, error } = await client.auth.admin.createUser({ email: payload.email, password: payload.password, email_confirm: true, user_metadata: { name: payload.name } });
    // Red caída o 5xx de Auth (p. ej. el trigger de perfiles falló): no es un correo/contraseña inválidos.
    if (error && authUnavailable(error)) throw error;
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
    if (error) {
      // Cada excepción de admin_update_profile tiene su propio estado; un fallo de red o de la base es 5xx.
      if (error.message.includes('self_lockout')) throw new HttpError(409, 'No puedes retirar tu propio acceso ni tu rol de administrador.');
      if (error.message.includes('last_admin')) throw new HttpError(409, 'Debe quedar al menos un administrador activo.');
      if (error.message.includes('profile_missing')) throw new HttpError(404, 'La cuenta no existe.');
      if (error.message.includes('admin_required')) throw new HttpError(403, 'Esta operación requiere un administrador activo.');
      if (error.message.includes('invalid_profile')) throw new HttpError(400, 'Revisa el nombre y el rol.');
      throw error;
    }
    return reply({ ok: true });
  } catch (error) { return failure(error); }
}
