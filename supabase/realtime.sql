-- Ejecutar después de functions.sql. Publicar exclusivamente tablas de consulta.
do $$
declare target text;
begin
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
  create publication supabase_realtime;
 end if;
 foreach target in array array['devices','measurements','train_status','solar_station'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=target) then
   execute format('alter publication supabase_realtime add table public.%I',target);
  end if;
 end loop;
end $$;
