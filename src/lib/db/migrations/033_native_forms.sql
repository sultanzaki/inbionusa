begin;
set local lock_timeout='15s';
select pg_advisory_xact_lock(49281041);
create table if not exists public.erp_forms(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.users(id),public_token uuid unique not null default gen_random_uuid(),draft jsonb not null,published jsonb,published_revision integer not null default 0,version integer not null default 1,active boolean not null default false,created_at timestamptz not null default now());
create table if not exists public.erp_form_submissions(id uuid primary key default gen_random_uuid(),form_id uuid not null references public.erp_forms(id),revision integer not null,template jsonb not null,request_key uuid not null,payload_hash text not null,answers jsonb not null,files jsonb not null default '[]',cleaning_id uuid references public.erp_equipment_cleaning(id),created_at timestamptz not null default now(),unique(form_id,request_key));
alter table public.erp_forms enable row level security;
alter table public.erp_form_submissions enable row level security;
revoke all on public.erp_forms,public.erp_form_submissions from public,anon,authenticated,service_role;
create or replace function public.erp_forms_admin(p_token text,p_action text,p_id uuid default null,p_template jsonb default null,p_version integer default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor public.users;f public.erp_forms;r uuid;begin
 actor:=public.erp_actor(p_token);if actor.role not in ('admin qc','administrator inbionusa') then raise insufficient_privilege;end if;
 if p_action='list' then return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.erp_forms x),'[]');end if;
 if p_action='create' then
  if length(p_template::text)>64000 or jsonb_typeof(p_template->'fields')<>'array' then raise check_violation;end if;
  insert into public.erp_forms(owner_id,draft) values(actor.id,p_template) returning id into r;return jsonb_build_object('id',r);
 end if;
 select * into f from public.erp_forms where id=p_id for update;if not found then raise no_data_found;end if;
 if p_action='detail' then return to_jsonb(f)||jsonb_build_object('submissions',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from (select * from public.erp_form_submissions where form_id=f.id order by created_at desc limit 100)s),'[]'));end if;
 if p_version is distinct from f.version then raise exception 'The form changed. Reload before saving.';end if;
 if p_action='save' then
  if length(p_template::text)>64000 or jsonb_typeof(p_template->'fields')<>'array' then raise check_violation;end if;
  update public.erp_forms set draft=p_template,version=version+1 where id=f.id;
 elsif p_action='publish' then
  perform public.erp_assert(actor.id,'production','write');
  update public.erp_forms set published=draft,published_revision=published_revision+1,active=true,owner_id=actor.id,version=version+1 where id=f.id;
 elsif p_action='pause' then update public.erp_forms set active=false,version=version+1 where id=f.id;
 elsif p_action='rotate' then update public.erp_forms set public_token=gen_random_uuid(),version=version+1 where id=f.id;
 else raise check_violation;end if;
 perform public.work_event('forms',f.id,p_action,actor.id,'Form administration',jsonb_build_object('revision',f.published_revision),jsonb_build_object('version',f.version+1));return jsonb_build_object('id',f.id);
end $$;
create or replace function public.erp_form_equipment_batches(p_equipment uuid) returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 with latest as(select * from public.erp_equipment_uses where equipment_id=p_equipment order by started_at desc,id desc limit 1), numbers as (
 select m.number from latest u join public.erp_manufacturing_orders m on m.id=u.manufacturing_order_id
 union select l.number from latest u join public.erp_manufacturing_outputs o on o.manufacturing_order_id=u.manufacturing_order_id join public.erp_lots l on l.id=o.lot_id
 union select m.number from latest u join public.erp_movements m on m.id=u.movement_id
 union select l.number from latest u join public.erp_movements m on m.id=u.movement_id cross join lateral jsonb_array_elements(m.lines) x join public.erp_lots l on l.id=(x->>'lot_id')::uuid)
 select coalesce(jsonb_agg(number order by number),'[]') from numbers;
$$;
revoke all on function public.erp_form_equipment_batches(uuid) from public,anon,authenticated,service_role;
create or replace function public.erp_form_public(p_link uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare f public.erp_forms;equipment jsonb;staff jsonb;begin
 select * into f from public.erp_forms where public_token=p_link and active and published is not null;
 if not found then raise no_data_found;end if;
 if not exists(select from public.users where id=f.owner_id and is_active and not must_change_password) then raise insufficient_privilege;end if;
 perform public.erp_assert(f.owner_id,'production','write');
 if f.published->>'kind'='equipment_cleaning' then
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'code',e.code,'area',l.name,'state',e.state,'batches',public.erp_form_equipment_batches(e.id)) order by e.name),'[]') into equipment from public.erp_equipment e join public.erp_locations l on l.id=e.location_id where e.state<>'inactive' and public.work_location_allowed(f.owner_id,e.location_id);
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.nama_lengkap,'username',u.username) order by u.nama_lengkap),'[]') into staff from public.users u where u.is_active and not u.must_change_password and public.erp_can(u.id,'production','write');
 end if;
 return jsonb_build_object('template',f.published,'revision',f.published_revision,'equipment',coalesce(equipment,'[]'),'staff',coalesce(staff,'[]'));
end $$;
create or replace function public.erp_form_public_receipt(p_link uuid,p_request uuid,p_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare f public.erp_forms;s public.erp_form_submissions;begin
 perform public.erp_form_public(p_link);
 select * into f from public.erp_forms where public_token=p_link;
 select * into s from public.erp_form_submissions where form_id=f.id and request_key=p_request;
 if not found then return null;end if;
 if s.payload_hash<>p_hash then raise exception 'This submission identifier has already been used. Reload the form.';end if;
 return jsonb_build_object('id',s.id,'duplicate',true,'cleaning_result',(select result from public.erp_equipment_cleaning where id=s.cleaning_id));
end $$;
create or replace function public.erp_form_submit(p_link uuid,p_revision integer,p_request uuid,p_hash text,p_answers jsonb,p_files jsonb,p_cleaning jsonb default null,p_pass boolean default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare f public.erp_forms;existing jsonb;cleaning jsonb;result uuid;begin
 perform pg_advisory_xact_lock(49281041);perform public.erp_form_public(p_link);
 select * into f from public.erp_forms where public_token=p_link for update;
 existing:=public.erp_form_public_receipt(p_link,p_request,p_hash);if existing is not null then return existing;end if;
 if f.published_revision<>p_revision then raise exception 'The form was updated. Reload before submitting.';end if;
 if length(p_answers::text)>200000 or jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files)>3 then raise check_violation;end if;
 if f.published->>'kind'='equipment_cleaning' then
  if p_cleaning is null or p_pass is null then raise check_violation;end if;
  cleaning:=public.erp_import_equipment_cleaning(f.owner_id,p_cleaning||jsonb_build_object('source_id','native-form:'||f.id,'event_id',p_request),p_pass,p_hash);
 end if;
 insert into public.erp_form_submissions(form_id,revision,template,request_key,payload_hash,answers,files,cleaning_id) values(f.id,f.published_revision,f.published,p_request,p_hash,p_answers,p_files,nullif(cleaning->>'id','')::uuid) returning id into result;
 return jsonb_build_object('id',result,'duplicate',false,'cleaning_result',cleaning->>'result');
end $$;
-- An authenticated administrator receives a file path only from a stored submission.
create or replace function public.erp_form_file(p_token text,p_submission uuid,p_index integer) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$declare actor public.users;r jsonb;begin
 actor:=public.erp_actor(p_token);if actor.role not in ('admin qc','administrator inbionusa') then raise insufficient_privilege;end if;
 select files->p_index into r from public.erp_form_submissions where id=p_submission;if r is null then raise no_data_found;end if;return r;
end $$;
do $$declare p regprocedure;begin
 for p in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in ('erp_forms_admin','erp_form_public','erp_form_submit','erp_form_public_receipt','erp_form_file') loop
 execute format('revoke all on function %s from public,anon,authenticated',p);execute format('grant execute on function %s to service_role',p);end loop;
end $$;
-- Native form choices resolve identities by ID; the existing importer still verifies names and location access.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.erp_import_equipment_cleaning(uuid,jsonb,boolean,text)'::regprocedure);
 if position('p_payload->>''equipment_id''' in definition)=0 then
  if position('where lower(btrim(a.name))=' in definition)=0 then raise exception 'Unexpected equipment import implementation';end if;
  definition:=replace(definition,'where lower(btrim(a.name))=', 'where (nullif(p_payload->>''equipment_id'','''') is null or a.id=nullif(p_payload->>''equipment_id'','''')::uuid) and lower(btrim(a.name))=');
  definition:=replace(definition,'lower(btrim(nama_lengkap))=lower(btrim(f->>''Nama Petugas''))','lower(btrim(nama_lengkap))=lower(btrim(f->>''Nama Petugas'')) and (nullif(p_payload->>''cleaned_by_id'','''') is null or id=nullif(p_payload->>''cleaned_by_id'','''')::uuid)');
  definition:=replace(definition,'lower(btrim(nama_lengkap))=lower(btrim(f->>''Nama Pemeriksa/Penanggung Jawab Verifikasi''))','lower(btrim(nama_lengkap))=lower(btrim(f->>''Nama Pemeriksa/Penanggung Jawab Verifikasi'')) and (nullif(p_payload->>''inspected_by_id'','''') is null or id=nullif(p_payload->>''inspected_by_id'','''')::uuid)');
  execute definition;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
