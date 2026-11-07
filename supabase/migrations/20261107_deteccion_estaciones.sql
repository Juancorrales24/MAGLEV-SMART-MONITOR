-- Migración 20261107: detección por sensores infrarrojos y voltaje de batería.
--
-- Contexto: el prototipo dejó de usar levitación magnética. El tren se detecta con tres sensores
-- infrarrojos (uno por estación) y la estación solar reporta también el voltaje de la batería.
--
-- Esta migración es ADITIVA e IDEMPOTENTE: no elimina tablas, columnas ni filas.
-- Las columnas levitation_height, stability y temperature se conservan para no destruir los
-- registros de la versión anterior; la interfaz ya no las presenta.
--
-- Aplicación: ejecutar una vez contra el proyecto Supabase. Los scripts completos
-- (database.sql, policies.sql, functions.sql, realtime.sql) ya incluyen estos cambios para
-- instalaciones nuevas; esta migración es para un proyecto que ya estaba desplegado.
--
-- Verificación posterior: supabase/verify.sql
begin;

-- 1. Nombres editables de las tres estaciones físicas. El firmware identifica la estación por el
--    número fijo de su sensor (station_number 1-3, por cableado), nunca por el nombre: renombrar
--    aquí no obliga a recargar el firmware.
create table if not exists public.stations (
 id uuid primary key default gen_random_uuid(),
 position smallint not null unique check (position between 1 and 3),
 name text not null check (char_length(name) between 1 and 100), created_at timestamptz not null default now()
);
insert into public.stations(position,name) values (1,'Estación 1'),(2,'Estación 2'),(3,'Estación 3')
 on conflict (position) do nothing;

-- 2. Evento del sensor infrarrojo: número de estación y si el tren entró (true) o salió (false).
alter table public.train_status add column if not exists station_number smallint check (station_number between 1 and 3);
alter table public.train_status add column if not exists detected boolean;

-- 3. Voltaje medido de la batería de litio. battery_level sigue siendo una estimación por voltaje.
alter table public.solar_station add column if not exists battery_voltage double precision check (battery_voltage between 0 and 10000);

-- 4. Historial por estación: la vista ferroviaria filtra detecciones de una estación concreta.
create index if not exists train_station on public.train_status(station_number,created_at desc,id desc);

-- 5. Seguridad de la tabla nueva: cerrada por defecto, lectura solo para cuentas activas.
--    Renombrar estaciones pasa por la API administrativa (service_role), igual que los dispositivos.
alter table public.stations enable row level security;
revoke all on public.stations from anon,authenticated;
grant all on public.stations to service_role;
grant select on public.stations to authenticated;
drop policy if exists maglev_stations_read on public.stations;
create policy maglev_stations_read on public.stations for select to authenticated using((select private.maglev_active()));

commit;

-- 6. Realtime: publicar la tabla de estaciones (train_status y solar_station ya están publicadas).
do $$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='stations') then
  execute 'alter publication supabase_realtime add table public.stations';
 end if;
end $$;

-- 7. La función ingest_telemetry debe reemplazarse con la versión de supabase/functions.sql,
--    que escribe station_number/detected y battery_voltage. Conserva la misma firma
--    (p_device_id, p_sample_id, p_sampled_at, p_measurements, p_train, p_solar), así que no
--    requiere recrear permisos ni romper llamadas existentes.
