-- Crear primero la cuenta en Supabase > Authentication > Users > Add user.
-- Reemplazar el correo dentro de las comillas antes de ejecutar UNA vez.
do $$
declare admin_email text := 'TU_CORREO_AQUI'; target_id uuid;
begin
 if admin_email='TU_CORREO_AQUI' then raise exception 'Reemplaza TU_CORREO_AQUI por el correo de tu administrador.'; end if;
 select id into target_id from auth.users where lower(email)=lower(admin_email);
 if target_id is null then raise exception 'No existe esa cuenta en Authentication > Users.'; end if;
 update public.profiles set role='admin',active=true where id=target_id;
 if not found then raise exception 'Falta el perfil. Ejecuta database.sql primero.'; end if;
end $$;
