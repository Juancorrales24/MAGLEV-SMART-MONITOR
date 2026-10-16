-- Consulta de diagnóstico: no modifica datos.
select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('profiles','devices','measurements','train_status','solar_station','device_credentials','ingest_receipts');
select tablename,policyname,roles,cmd from pg_policies where schemaname='public' and policyname like 'maglev_%';
select tablename from pg_publication_tables where pubname='supabase_realtime';
-- Debe devolver cero filas: funciones SECURITY DEFINER de public ejecutables por clientes vía RPC.
select p.proname as funcion_expuesta from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute'));
select count(*) as administradores_activos from public.profiles where role='admin' and active;
