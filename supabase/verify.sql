-- Consulta de diagnóstico: no modifica datos.
select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('profiles','devices','measurements','train_status','solar_station','device_credentials','ingest_receipts');
select tablename,policyname,roles,cmd from pg_policies where schemaname='public' and policyname like 'maglev_%';
select tablename from pg_publication_tables where pubname='supabase_realtime';
select count(*) as administradores_activos from public.profiles where role='admin' and active;
