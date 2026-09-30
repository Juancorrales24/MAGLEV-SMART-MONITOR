-- Ejecutar después de policies.sql. Funciones invocables solo por el servidor.
begin;
create or replace function public.ingest_telemetry(
 p_device_id uuid, p_sample_id uuid, p_sampled_at timestamptz,
 p_measurements jsonb, p_train jsonb, p_solar jsonb
) returns boolean language plpgsql security definer set search_path='' as $$
declare d public.devices; stamp timestamptz := clock_timestamp();
begin
 -- El bloqueo serializa mensajes de un mismo dispositivo y hace atómica la desactivación.
 select * into d from public.devices where id=p_device_id for update;
 if not found or not d.enabled then raise exception 'device_disabled'; end if;
 if exists(select 1 from public.ingest_receipts where device_id=p_device_id and sample_id=p_sample_id) then return false; end if;
 if d.last_seen > stamp - interval '1 second' then raise exception 'rate_limit'; end if;
 if p_measurements is null and p_train is null and p_solar is null then raise exception 'empty_payload'; end if;
 if p_sampled_at > stamp + interval '5 minutes' then raise exception 'future_timestamp'; end if;
 insert into public.ingest_receipts(device_id,sample_id,created_at) values(p_device_id,p_sample_id,stamp);
 if p_measurements is not null then
  insert into public.measurements(device_id,sample_id,sampled_at,voltage,current,power,energy,created_at)
  values(p_device_id,p_sample_id,p_sampled_at,(p_measurements->>'voltage')::double precision,(p_measurements->>'current')::double precision,(p_measurements->>'power')::double precision,(p_measurements->>'energy')::double precision,stamp);
 end if;
 if p_train is not null then
  insert into public.train_status(device_id,sample_id,sampled_at,levitation_height,stability,temperature,created_at)
  values(p_device_id,p_sample_id,p_sampled_at,(p_train->>'levitation_height')::double precision,(p_train->>'stability')::double precision,(p_train->>'temperature')::double precision,stamp);
 end if;
 if p_solar is not null then
  insert into public.solar_station(device_id,sample_id,sampled_at,panel_voltage,panel_current,battery_level,power_output,created_at)
  values(p_device_id,p_sample_id,p_sampled_at,(p_solar->>'panel_voltage')::double precision,(p_solar->>'panel_current')::double precision,(p_solar->>'battery_level')::double precision,(p_solar->>'power_output')::double precision,stamp);
 end if;
 update public.devices set last_seen=stamp where id=p_device_id;
 return true;
end; $$;
create or replace function public.admin_update_profile(p_actor uuid,p_id uuid,p_name text,p_role text,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
declare target public.profiles;
begin
 perform pg_advisory_xact_lock(8631101);
 if not exists(select 1 from public.profiles where id=p_actor and active and role='admin') then raise exception 'admin_required'; end if;
 select * into target from public.profiles where id=p_id for update;
 if not found then raise exception 'profile_missing'; end if;
 if p_role not in ('admin','observer') or length(trim(p_name)) not between 2 and 100 then raise exception 'invalid_profile'; end if;
 if p_id=p_actor and (not p_active or p_role<>'admin') then raise exception 'self_lockout'; end if;
 if target.active and target.role='admin' and (not p_active or p_role<>'admin') and
  (select count(*) from public.profiles where active and role='admin')<=1 then raise exception 'last_admin'; end if;
 update public.profiles set name=trim(p_name),role=p_role,active=p_active where id=p_id;
end; $$;
revoke all on function public.ingest_telemetry(uuid,uuid,timestamptz,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.admin_update_profile(uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.ingest_telemetry(uuid,uuid,timestamptz,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.admin_update_profile(uuid,uuid,text,text,boolean) to service_role;
commit;
