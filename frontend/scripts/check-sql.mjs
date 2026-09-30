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
let result=await db.query(`select ingest_telemetry($1,$2,null,$3::jsonb,$4::jsonb,$5::jsonb) as inserted`,[device,sample,JSON.stringify({voltage:0,power:12}),JSON.stringify({temperature:23}),JSON.stringify({battery_level:80})]);assert.equal(result.rows[0].inserted,true);
result=await db.query(`select ingest_telemetry($1,$2,null,$3::jsonb,null,null) as inserted`,[device,sample,JSON.stringify({voltage:0})]);assert.equal(result.rows[0].inserted,false);
await db.exec('reset role;');
assert.equal((await db.query('select count(*)::int as n from measurements')).rows[0].n,1);
console.log('PASS: ingestión atómica y reintento sin duplicados');
await db.exec(`set role authenticated; set request.jwt.claim.sub='${observer}';`);
assert.equal((await db.query('select * from measurements')).rows.length,1);
assert.equal((await db.query('select * from profiles')).rows.length,1);
await assert.rejects(()=>db.query('select * from device_credentials'));
await assert.rejects(()=>db.query(`update profiles set role='admin'`));
await assert.rejects(()=>db.query(`select ingest_telemetry($1,$2,null,$3::jsonb,null,null)`,[device,sample,'{}']));
console.log('PASS: observador consulta datos, no secretos ni cambios de rol');
await db.exec(`set request.jwt.claim.sub='${outsider}';`);
assert.equal((await db.query('select * from measurements')).rows.length,0);
assert.equal((await db.query('select * from devices')).rows.length,0);
console.log('PASS: cuenta inactiva no accede a la telemetría');
await db.exec('reset role; set role anon;'); await assert.rejects(()=>db.query('select * from measurements'));
await db.exec('reset role; set role service_role;');
await assert.rejects(()=>db.query(`select admin_update_profile($1,$1,'Admin','observer',true)`,[admin]));
await db.exec('reset role;');
await db.query('update devices set enabled=false where id=$1',[device]); await db.exec('set role service_role;');
await assert.rejects(()=>db.query(`select ingest_telemetry($1,$2,null,$3::jsonb,null,null)`,[device,'55555555-5555-4555-8555-555555555555','{"voltage":2}']));
console.log('PASS: sin acceso anónimo, sin auto-bloqueo admin, dispositivo desactivado bloqueado');
await db.close();
