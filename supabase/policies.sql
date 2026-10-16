-- Ejecutar después de database.sql.
begin;
-- Las funciones auxiliares de RLS son SECURITY DEFINER (deben leer profiles sin recursión de políticas)
-- y el rol authenticated necesita EXECUTE para evaluar las políticas. Por eso viven en un esquema
-- que PostgREST no expone: no se pueden invocar como /rest/v1/rpc/*.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
create or replace function private.maglev_active() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and active);
$$;
create or replace function private.maglev_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and active and role='admin');
$$;
revoke all on function private.maglev_active(), private.maglev_admin() from public,anon;
grant execute on function private.maglev_active(), private.maglev_admin() to authenticated;
grant select on public.profiles,public.devices,public.measurements,public.train_status,public.solar_station to authenticated;
drop policy if exists maglev_profile_read on public.profiles;
create policy maglev_profile_read on public.profiles for select to authenticated using(id=(select auth.uid()) or (select private.maglev_admin()));
drop policy if exists maglev_device_read on public.devices;
create policy maglev_device_read on public.devices for select to authenticated using((select private.maglev_active()));
drop policy if exists maglev_measurements_read on public.measurements;
create policy maglev_measurements_read on public.measurements for select to authenticated using((select private.maglev_active()));
drop policy if exists maglev_train_read on public.train_status;
create policy maglev_train_read on public.train_status for select to authenticated using((select private.maglev_active()));
drop policy if exists maglev_solar_read on public.solar_station;
create policy maglev_solar_read on public.solar_station for select to authenticated using((select private.maglev_active()));
-- Versiones anteriores las creaban en public (expuestas por RPC). Se eliminan después de
-- recrear las políticas, que eran sus únicas dependencias.
drop function if exists public.maglev_active();
drop function if exists public.maglev_admin();
-- No hay INSERT/UPDATE/DELETE para los clientes. Las mutaciones pasan por la API.
-- device_credentials e ingest_receipts son exclusivas del servidor (service_role omite RLS).
-- Denegación explícita: deja constancia de la intención y sigue vigente aunque alguien conceda
-- privilegios o añada una política permisiva por error (las restrictivas se combinan con AND).
drop policy if exists maglev_credentials_deny on public.device_credentials;
create policy maglev_credentials_deny on public.device_credentials as restrictive for all to anon, authenticated using(false) with check(false);
drop policy if exists maglev_receipts_deny on public.ingest_receipts;
create policy maglev_receipts_deny on public.ingest_receipts as restrictive for all to anon, authenticated using(false) with check(false);
commit;
