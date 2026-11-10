import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
// Base PostgreSQL aislada en memoria. Nunca conecta ni modifica Supabase.
const root = fileURLToPath(new URL('../../', import.meta.url));
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
-- Reproducir la tabla del paquete anterior para comprobar su actualización.
create table measurements(id uuid primary key default gen_random_uuid(),voltage float,current float,power float,energy float,created_at timestamp default now());`);
for(const file of ['database.sql','policies.sql','functions.sql']) {
  await db.exec(fs.readFileSync(root+'/supabase/'+file,'utf8').replace('create extension if not exists pgcrypto;',''));
  console.log('SQL OK:',file);
}
// Repetibilidad de los scripts.
for(const file of ['database.sql','policies.sql','functions.sql']) await db.exec(fs.readFileSync(root+'/supabase/'+file,'utf8').replace('create extension if not exists pgcrypto;',''));
const admin='11111111-1111-4111-8111-111111111111', observer='22222222-2222-4222-8222-222222222222', outsider='33333333-3333-4333-8333-333333333333';
await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values('${admin}','admin@example.test','{"role":"admin"}'),('${observer}','observer@example.test','{}'),('${outsider}','outside@example.test','{"role":"admin","active":true}');`);
let rows=(await db.query('select role,active from public.profiles')).rows;
assert.ok(rows.every(r=>r.role==='observer'&&!r.active)); console.log('PASS: auto-registro no concede acceso ni rol admin');
await db.exec(`update profiles set active=true,role='admin' where id='${admin}'; update profiles set active=true where id='${observer}';`);
const device=(await db.query(`insert into devices(name) values('QA isolated device') returning id`)).rows[0].id;
await db.exec(`insert into device_credentials(device_id,token_hash) values('${device}',repeat('a',64));`);
const sample='44444444-4444-4444-8444-444444444444';
await db.exec('set role service_role;');
let result=await db.query(`select ingest_telemetry($1,$2,null,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb) as inserted`,[device,sample,JSON.stringify({voltage:0,power:12}),JSON.stringify({station_number:2,detected:true,prev_station_number:1,ms_from_prev:4800,lap_ms:13200}),JSON.stringify({panel_voltage:5.8,battery_voltage:3.7,battery_level:20}),JSON.stringify({reset_reason:'brownout',uptime_s:120,rssi_dbm:-44,free_heap_b:137000,queue_dropped:0})]);assert.equal(result.rows[0].inserted,true);
result=await db.query(`select ingest_telemetry($1,$2,null,$3::jsonb,null,null,null) as inserted`,[device,sample,JSON.stringify({voltage:0})]);assert.equal(result.rows[0].inserted,false);
await db.exec('reset role;');
assert.equal((await db.query('select count(*)::int as n from measurements')).rows[0].n,1);
console.log('PASS: ingestión atómica y reintento sin duplicados');
// Contrato nuevo: el evento del sensor y el voltaje de batería llegan completos a sus tablas.
let event=(await db.query('select station_number,detected,levitation_height,prev_station_number,ms_from_prev,lap_ms from train_status')).rows;
assert.deepEqual(event,[{station_number:2,detected:true,levitation_height:null,prev_station_number:1,ms_from_prev:4800,lap_ms:13200}]);
// Salud del dispositivo: la muestra completa queda en su tabla.
assert.deepEqual((await db.query('select reset_reason,uptime_s,rssi_dbm,free_heap_b,queue_dropped from device_health')).rows,
 [{reset_reason:'brownout',uptime_s:120,rssi_dbm:-44,free_heap_b:137000,queue_dropped:0}]);
assert.deepEqual((await db.query('select panel_voltage,battery_voltage,battery_level from solar_station')).rows,[{panel_voltage:5.8,battery_voltage:3.7,battery_level:20}]);
// La salida del sensor (detected=false) se registra como evento propio, no se descarta.
// last_seen se reinicia porque el límite de un mensaje por segundo es parte del contrato.
await db.query('update devices set last_seen=null where id=$1',[device]);
await db.exec('set role service_role;');
await db.query(`select ingest_telemetry($1,$2,null,null,$3::jsonb,null,null)`,[device,'66666666-6666-4666-8666-666666666666',JSON.stringify({station_number:2,detected:false})]);
await db.exec('reset role;');
assert.equal((await db.query('select count(*)::int as n from train_status where detected=false')).rows[0].n,1);
// Una estación inexistente la rechaza la base, no solo Zod.
await db.query('update devices set last_seen=null where id=$1',[device]);
await db.exec('set role service_role;');
await assert.rejects(()=>db.query(`select ingest_telemetry($1,$2,null,null,$3::jsonb,null,null)`,[device,'77777777-7777-4777-8777-777777777777',JSON.stringify({station_number:4,detected:true})]));
// Un "tiempo de vuelta" mayor de 10 minutos no es una vuelta: lo rechaza la base, no solo Zod.
await db.query('update devices set last_seen=null where id=$1',[device]);
await assert.rejects(()=>db.query(`select ingest_telemetry($1,$2,null,null,$3::jsonb,null,null)`,[device,'88888888-8888-4888-8888-888888888888',JSON.stringify({station_number:1,detected:true,lap_ms:700000})]));
await db.exec('reset role;');
assert.deepEqual((await db.query('select position,name,gap_to_next_m from stations order by position')).rows,[{position:1,name:'Estación 1',gap_to_next_m:null},{position:2,name:'Estación 2',gap_to_next_m:null},{position:3,name:'Estación 3',gap_to_next_m:null}]);
// La distancia por tramo se guarda y una negativa la rechaza la base.
await db.query('update stations set gap_to_next_m=2.35 where position=1');
await assert.rejects(()=>db.query('update stations set gap_to_next_m=-1 where position=2'));
console.log('PASS: detección por estación, salida del sensor y voltaje de batería almacenados');
await db.exec(`set role authenticated; set request.jwt.claim.sub='${observer}';`);
assert.equal((await db.query('select * from measurements')).rows.length,1);
assert.equal((await db.query('select * from profiles')).rows.length,1);
await assert.rejects(()=>db.query('select * from device_credentials'));
await assert.rejects(()=>db.query(`update profiles set role='admin'`));
await assert.rejects(()=>db.query(`select ingest_telemetry($1,$2,null,$3::jsonb,null,null,null)`,[device,sample,'{}']));
await assert.rejects(()=>db.query('select * from ingest_receipts'));
console.log('PASS: observador consulta datos, no secretos ni cambios de rol');
await db.exec('reset role;');
// Ninguna función SECURITY DEFINER de public queda ejecutable por clientes (sería invocable vía /rest/v1/rpc).
rows=(await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute'))`)).rows;
assert.deepEqual(rows,[]);
rows=(await db.query(`select tablename from pg_policies where schemaname='public' and tablename in ('device_credentials','ingest_receipts') and permissive='RESTRICTIVE' order by 1`)).rows;
assert.deepEqual(rows.map(r=>r.tablename),['device_credentials','ingest_receipts']);
await db.exec(`set role authenticated; set request.jwt.claim.sub='${observer}';`);
console.log('PASS: funciones auxiliares de RLS fuera del esquema expuesto y secretos con denegación explícita');
await db.exec(`set request.jwt.claim.sub='${outsider}';`);
assert.equal((await db.query('select * from measurements')).rows.length,0);
assert.equal((await db.query('select * from devices')).rows.length,0);
console.log('PASS: cuenta inactiva no accede a la telemetría');
await db.exec('reset role; set role anon;'); await assert.rejects(()=>db.query('select * from measurements'));
await db.exec('reset role; set role service_role;');
await assert.rejects(()=>db.query(`select admin_update_profile($1,$1,'Admin','observer',true)`,[admin]));
await db.exec('reset role;');
await db.query('update devices set enabled=false where id=$1',[device]); await db.exec('set role service_role;');
await assert.rejects(()=>db.query(`select ingest_telemetry($1,$2,null,$3::jsonb,null,null,null)`,[device,'55555555-5555-4555-8555-555555555555','{"voltage":2}']));
console.log('PASS: sin acceso anónimo, sin auto-bloqueo admin, dispositivo desactivado bloqueado');
await db.close();
