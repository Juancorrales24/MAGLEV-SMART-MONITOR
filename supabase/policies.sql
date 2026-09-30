-- Ejecutar después de database.sql.
begin;
create or replace function public.maglev_active() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and active);
$$;
create or replace function public.maglev_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and active and role='admin');
$$;
revoke all on function public.maglev_active(), public.maglev_admin() from public,anon;
grant execute on function public.maglev_active(), public.maglev_admin() to authenticated;
grant select on public.profiles,public.devices,public.measurements,public.train_status,public.solar_station to authenticated;
drop policy if exists maglev_profile_read on public.profiles;
create policy maglev_profile_read on public.profiles for select to authenticated using(id=(select auth.uid()) or (select public.maglev_admin()));
drop policy if exists maglev_device_read on public.devices;
create policy maglev_device_read on public.devices for select to authenticated using((select public.maglev_active()));
drop policy if exists maglev_measurements_read on public.measurements;
create policy maglev_measurements_read on public.measurements for select to authenticated using((select public.maglev_active()));
drop policy if exists maglev_train_read on public.train_status;
create policy maglev_train_read on public.train_status for select to authenticated using((select public.maglev_active()));
drop policy if exists maglev_solar_read on public.solar_station;
create policy maglev_solar_read on public.solar_station for select to authenticated using((select public.maglev_active()));
-- No hay INSERT/UPDATE/DELETE para los clientes. Las mutaciones pasan por la API.
-- device_credentials e ingest_receipts no tienen permisos ni políticas para clientes.
commit;
