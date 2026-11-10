-- Ejecutar primero. No incluye datos de demostración ni elimina mediciones existentes.
begin;
create extension if not exists pgcrypto;
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null default '', email text not null default '',
 role text not null default 'observer' check (role in ('admin','observer')),
 active boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.devices (
 id uuid primary key default gen_random_uuid(), name text not null check (char_length(name) between 2 and 100),
 kind text not null default 'combined' check (kind in ('train','solar','combined')),
 location text not null default '', enabled boolean not null default true,
 last_seen timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.device_credentials (
 device_id uuid primary key references public.devices(id) on delete cascade,
 token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'), updated_at timestamptz not null default now()
);
create table if not exists public.ingest_receipts (
 device_id uuid not null references public.devices(id), sample_id uuid not null,
 created_at timestamptz not null default now(), primary key (device_id, sample_id)
);
create table if not exists public.measurements (
 id uuid primary key default gen_random_uuid(), device_id uuid references public.devices(id),
 sample_id uuid not null default gen_random_uuid(), sampled_at timestamptz,
 voltage double precision check (voltage between 0 and 10000),
 current double precision check (current between -10000 and 10000),
 power double precision check (power between -100000000 and 100000000),
 energy double precision check (energy between 0 and 1e12), created_at timestamptz not null default now()
);
-- Compatibilidad no destructiva con measurements del ZIP inicial de ocho archivos.
alter table public.measurements add column if not exists device_id uuid references public.devices(id);
alter table public.measurements add column if not exists sample_id uuid not null default gen_random_uuid();
alter table public.measurements add column if not exists sampled_at timestamptz;
do $$ begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='measurements' and column_name='created_at' and data_type='timestamp without time zone') then
  alter table public.measurements alter column created_at type timestamptz using created_at at time zone 'UTC';
 end if;
end $$;
-- Nombres editables de las tres estaciones físicas. El emisor manda el número fijo del sensor
-- (station_number 1-3, por cableado), nunca el nombre: renombrar aquí no obliga a recargar el firmware.
create table if not exists public.stations (
 id uuid primary key default gen_random_uuid(),
 position smallint not null unique check (position between 1 and 3),
 name text not null check (char_length(name) between 1 and 100), created_at timestamptz not null default now()
);
insert into public.stations(position,name) values (1,'Estación 1'),(2,'Estación 2'),(3,'Estación 3')
 on conflict (position) do nothing;
-- Distancia siguiendo la vía desde esta estación hasta la SIGUIENTE del circuito (1→2, 2→3, 3→1),
-- medida con cinta métrica y editable en Configuración. Null = sin medir: la interfaz muestra solo
-- tiempos y nunca inventa una rapidez.
alter table public.stations add column if not exists gap_to_next_m double precision check (gap_to_next_m > 0 and gap_to_next_m <= 1000);
-- El prototipo dejó de usar levitación: los eventos ahora son detecciones de sensores infrarrojos por estación.
-- Las columnas de levitación se conservan para no destruir registros de la versión anterior; la interfaz no las muestra.
create table if not exists public.train_status (
 id uuid primary key default gen_random_uuid(), device_id uuid not null references public.devices(id),
 sample_id uuid not null, sampled_at timestamptz,
 levitation_height double precision check (levitation_height between 0 and 1000),
 stability double precision check (stability between 0 and 100),
 temperature double precision check (temperature between -100 and 500), created_at timestamptz not null default now()
);
alter table public.train_status add column if not exists station_number smallint check (station_number between 1 and 3);
alter table public.train_status add column if not exists detected boolean;
-- Intervalos medidos por el ESP32 con su reloj monotónico (millis()) y enviados dentro del evento:
-- nunca se calculan con horas de recepción, que arrastran el retraso variable de la red.
-- Solo en llegadas (detected=true). lap_ms: ms desde la llegada anterior a ESTA estación (tiempo de
-- vuelta). prev_station_number/ms_from_prev: desde qué estación venía y cuántos ms tardó el tramo.
-- Tope de 10 minutos: un intervalo mayor no es una vuelta, es el tren detenido un rato.
alter table public.train_status add column if not exists prev_station_number smallint check (prev_station_number between 1 and 3);
alter table public.train_status add column if not exists ms_from_prev integer check (ms_from_prev between 1 and 600000);
alter table public.train_status add column if not exists lap_ms integer check (lap_ms between 1 and 600000);
-- panel_current y power_output quedan por compatibilidad: no hay sensor de corriente (ni INA219) en el prototipo.
create table if not exists public.solar_station (
 id uuid primary key default gen_random_uuid(), device_id uuid not null references public.devices(id),
 sample_id uuid not null, sampled_at timestamptz,
 panel_voltage double precision check (panel_voltage between 0 and 10000),
 panel_current double precision check (panel_current between -10000 and 10000),
 battery_level double precision check (battery_level between 0 and 100),
 power_output double precision check (power_output between -100000000 and 100000000), created_at timestamptz not null default now()
);
alter table public.solar_station add column if not exists battery_voltage double precision check (battery_voltage between 0 and 10000);
-- Salud del ESP32: una muestra cada ~30 s con el tren o sin él. reset_reason distingue un corte de
-- alimentación o brownout (problema de fuente, ya visto en campo) de un reinicio por software.
create table if not exists public.device_health (
 id uuid primary key default gen_random_uuid(), device_id uuid not null references public.devices(id),
 sample_id uuid not null, sampled_at timestamptz,
 reset_reason text check (char_length(reset_reason) between 1 and 40),
 uptime_s bigint check (uptime_s between 0 and 4294967295),
 rssi_dbm smallint check (rssi_dbm between -120 and 0),
 free_heap_b integer check (free_heap_b between 0 and 1073741824),
 queue_dropped integer check (queue_dropped between 0 and 2147483647),
 created_at timestamptz not null default now()
);
create unique index if not exists measurements_sample on public.measurements(device_id,sample_id);
create unique index if not exists train_sample on public.train_status(device_id,sample_id);
create unique index if not exists solar_sample on public.solar_station(device_id,sample_id);
create unique index if not exists health_sample on public.device_health(device_id,sample_id);
create index if not exists measurements_recent on public.measurements(device_id,created_at desc,id desc);
create index if not exists measurements_history on public.measurements(created_at desc,id desc);
create index if not exists train_recent on public.train_status(device_id,created_at desc,id desc);
-- Historial por estación: la vista ferroviaria filtra detecciones de una estación concreta.
create index if not exists train_station on public.train_status(station_number,created_at desc,id desc);
create index if not exists solar_recent on public.solar_station(device_id,created_at desc,id desc);
create index if not exists health_recent on public.device_health(device_id,created_at desc,id desc);
create index if not exists receipts_created on public.ingest_receipts(created_at);
create or replace function public.handle_maglev_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,name,email,role,active)
 values(new.id,left(coalesce(new.raw_user_meta_data->>'name',split_part(new.email,'@',1),'Usuario'),100),coalesce(new.email,''),'observer',false)
 on conflict(id) do update set email=excluded.email;
 return new;
end; $$;
drop trigger if exists maglev_auth_user on auth.users;
create trigger maglev_auth_user after insert or update of email on auth.users for each row execute procedure public.handle_maglev_user();
insert into public.profiles(id,name,email,role,active)
select id,left(coalesce(raw_user_meta_data->>'name',split_part(email,'@',1),'Usuario'),100),coalesce(email,''),'observer',false from auth.users on conflict(id) do nothing;
-- Todas las tablas quedan cerradas desde el primer script.
alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.device_credentials enable row level security;
alter table public.ingest_receipts enable row level security;
alter table public.measurements enable row level security;
alter table public.stations enable row level security;
alter table public.train_status enable row level security;
alter table public.solar_station enable row level security;
alter table public.device_health enable row level security;
revoke all on public.profiles,public.devices,public.device_credentials,public.ingest_receipts,public.measurements,public.stations,public.train_status,public.solar_station,public.device_health from anon,authenticated;
grant all on public.profiles,public.devices,public.device_credentials,public.ingest_receipts,public.measurements,public.stations,public.train_status,public.solar_station,public.device_health to service_role;
revoke all on function public.handle_maglev_user() from public,anon,authenticated;
commit;
