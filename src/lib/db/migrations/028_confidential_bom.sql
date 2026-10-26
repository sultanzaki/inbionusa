begin;
set local lock_timeout='15s';
set local statement_timeout='120s';
select pg_advisory_xact_lock(49281041);
lock table public.erp_formulas in share row exclusive mode;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$begin
 if to_regprocedure('extensions.crypt(text,text)') is null then raise exception 'pgcrypto must be installed in extensions before this migration.';end if;
end $$;

-- The protection belongs to the complete revision family, not an individual revision.
create table if not exists public.erp_bom_security(
 root_id uuid primary key, owner_id uuid not null references public.users(id),
 password_hash text, version integer not null default 1, updated_at timestamptz not null default now()
);
create table if not exists public.erp_bom_grants(
 root_id uuid not null references public.erp_bom_security(root_id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 granted_by uuid not null references public.users(id), created_at timestamptz not null default now(),
 primary key(root_id,user_id)
);
create table if not exists public.erp_bom_unlocks(
 root_id uuid not null references public.erp_bom_security(root_id) on delete cascade,
 session_token text not null references public.sessions(token) on delete cascade,
 security_version integer not null, expires_at timestamptz not null,
 primary key(root_id,session_token)
);
create table if not exists public.erp_bom_attempts(
 root_id uuid not null references public.erp_bom_security(root_id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 failures integer not null default 0, reset_at timestamptz not null,
 primary key(root_id,user_id)
);
insert into public.erp_bom_security(root_id,owner_id)
 select distinct on(root_id) root_id,created_by from public.erp_formulas order by root_id,revision,id
 on conflict do nothing;
create or replace function public.bom_initialize() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$begin
 insert into public.erp_bom_security(root_id,owner_id) values(new.root_id,new.created_by) on conflict do nothing;
 return new;
end $$;
drop trigger if exists bom_initialize on public.erp_formulas;
create trigger bom_initialize after insert on public.erp_formulas for each row execute function public.bom_initialize();

-- No administrator bypass. An application admin may request a recovery reset only.
create or replace function public.bom_allowed(actor uuid, formula uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select from public.erp_formulas f join public.erp_bom_security s on s.root_id=f.root_id join public.users u on u.id=actor where f.id=formula and u.is_active and not u.must_change_password and public.erp_can(actor,'production','read') and exists(select from public.erp_modules where key='production' and state<>'disabled') and (s.owner_id=actor or exists(select from public.erp_bom_grants g where g.root_id=s.root_id and g.user_id=actor)))
$$;
create or replace function public.bom_unlocked(actor uuid, formula uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select public.bom_allowed(actor,formula) and exists(select from public.erp_formulas f join public.erp_bom_security s on s.root_id=f.root_id join public.erp_bom_unlocks b on b.root_id=s.root_id and b.security_version=s.version join public.sessions sess on sess.token=b.session_token where f.id=formula and s.password_hash is not null and b.expires_at>now() and sess.user_id=actor and sess.expires_at>now() and sess.token=nullif(current_setting('bom.session',true),''))
$$;
create or replace function public.bom_assert(actor uuid,formula uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$begin
 perform 1 from public.erp_bom_security s join public.erp_formulas f on f.root_id=s.root_id where f.id=formula for share of s;
 if not public.bom_unlocked(actor,formula) then raise exception using errcode='P0001',message='BOM is locked. Open Formulas & BOM and unlock it with your BOM password.';end if;
end $$;
create or replace function public.erp_actor(p_token text) returns public.users language plpgsql security definer set search_path=pg_catalog,public as $$
declare u public.users;begin
 select us.* into u from public.users us join public.sessions s on s.user_id=us.id where s.token=p_token and s.expires_at>now() and us.is_active and not us.must_change_password;
 if not found then raise insufficient_privilege using message='Session expired.';end if;
 perform set_config('app.actor',u.nama_lengkap,true);perform set_config('work.actor',u.id::text,true);perform set_config('bom.session',p_token,true);return u;
end $$;

create or replace function public.bom_check_password(p text) returns void language plpgsql immutable set search_path=pg_catalog,public as $$begin
 if p is null or length(btrim(p))<16 or octet_length(p)>64 then raise exception using errcode='P0001',message='Use a BOM password of at least 16 characters and at most 64 UTF-8 bytes.';end if;
end $$;
create or replace function public.bom_log(actor uuid, action text, root uuid, details jsonb default '{}') returns void language sql security definer set search_path=pg_catalog,public as $$
 insert into public.audit_log(user_name,aksi,referensi,after_data) select nama_lengkap,'BOM_'||upper(action),root::text,details from public.users where id=actor
$$;
create or replace function public.erp_bom_security(p_token text,p_action text,p_formula uuid,p_password text default null,p_user uuid default null,p_reason text default '') returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare actor public.users;s public.erp_bom_security;root uuid;attempt public.erp_bom_attempts;expiry timestamptz;allowed boolean;unlocked boolean;is_owner boolean;admin boolean;begin
 actor:=public.erp_actor(p_token);perform public.erp_assert(actor.id,'production','read');
 select root_id into root from public.erp_formulas where id=p_formula;if not found then raise no_data_found;end if;
 select * into s from public.erp_bom_security where root_id=root for update;
 if not found then raise insufficient_privilege;end if;
 is_owner:=s.owner_id=actor.id;admin:=actor.role in ('administrator inbionusa','admin qc');
 allowed:=public.bom_allowed(actor.id,p_formula);unlocked:=public.bom_unlocked(actor.id,p_formula);
 if p_action='recover' then
  if not admin then raise insufficient_privilege;end if;
  if length(btrim(p_reason))<8 then raise exception using errcode='P0001',message='Enter a recovery reason of at least 8 characters.';end if;
  update public.erp_bom_security set password_hash=null,version=version+1,updated_at=now() where root_id=root;
  delete from public.erp_bom_unlocks where root_id=root;
  delete from public.erp_bom_attempts where root_id=root;
  perform public.bom_log(actor.id,'recovery_requested',root,jsonb_build_object('reason',p_reason,'owner_id',s.owner_id));
 elsif p_action='setup' then
  if not is_owner or s.password_hash is not null then raise insufficient_privilege;end if;
  perform public.bom_check_password(p_password);
  update public.erp_bom_security set password_hash=extensions.crypt(p_password,extensions.gen_salt('bf',12)),version=version+1,updated_at=now() where root_id=root;
  insert into public.erp_bom_unlocks values(root,p_token,s.version+1,least(now()+interval '15 minutes',(select expires_at from public.sessions where token=p_token))) on conflict(root_id,session_token) do update set security_version=excluded.security_version,expires_at=excluded.expires_at;
  perform public.bom_log(actor.id,'password_set',root);
 elsif p_action='unlock' then
  if not allowed then raise insufficient_privilege;end if;
  if s.password_hash is null then raise exception using errcode='P0001',message='The BOM owner must set its password first.';end if;
  insert into public.erp_bom_attempts values(root,actor.id,0,now()+interval '15 minutes') on conflict do nothing;
  select * into attempt from public.erp_bom_attempts where root_id=root and user_id=actor.id for update;
  if attempt.reset_at<=now() then
   update public.erp_bom_attempts set failures=0,reset_at=now()+interval '15 minutes' where root_id=root and user_id=actor.id;attempt.failures:=0;
  end if;
  if attempt.failures>=5 then return jsonb_build_object('error','Too many BOM password attempts. Try again in 15 minutes.','status',429);end if;
  if p_password is null or octet_length(p_password)>64 or extensions.crypt(p_password,s.password_hash)<>s.password_hash then
   update public.erp_bom_attempts set failures=failures+1 where root_id=root and user_id=actor.id;
   perform public.bom_log(actor.id,'unlock_failed',root);
   return jsonb_build_object('error','Incorrect BOM password.','status',422);
  end if;
  delete from public.erp_bom_attempts where root_id=root and user_id=actor.id;
  insert into public.erp_bom_unlocks values(root,p_token,s.version,least(now()+interval '15 minutes',(select expires_at from public.sessions where token=p_token))) on conflict(root_id,session_token) do update set security_version=excluded.security_version,expires_at=excluded.expires_at;
  perform public.bom_log(actor.id,'unlocked',root);
 elsif p_action='lock' then
  delete from public.erp_bom_unlocks where root_id=root and session_token=p_token;
  perform public.bom_log(actor.id,'locked',root);
 elsif p_action in ('grant','revoke','rotate') then
  if not is_owner then raise insufficient_privilege;end if;perform public.bom_assert(actor.id,p_formula);
  if p_action='rotate' then
   perform public.bom_check_password(p_password);
   update public.erp_bom_security set password_hash=extensions.crypt(p_password,extensions.gen_salt('bf',12)),version=version+1,updated_at=now() where root_id=root;
   delete from public.erp_bom_unlocks where root_id=root;
   delete from public.erp_bom_attempts where root_id=root;
   insert into public.erp_bom_unlocks values(root,p_token,s.version+1,least(now()+interval '15 minutes',(select expires_at from public.sessions where token=p_token)));
  else
   if p_user is null or p_user=s.owner_id then raise check_violation;end if;
   if p_action='grant' then
    if not exists(select from public.users where id=p_user and is_active and not must_change_password and public.erp_can(id,'production','read')) then raise exception using errcode='P0001',message='Choose an active user with Production read access.';end if;
    insert into public.erp_bom_grants(root_id,user_id,granted_by) values(root,p_user,actor.id) on conflict do nothing;
   else
    delete from public.erp_bom_grants where root_id=root and user_id=p_user;
    delete from public.erp_bom_unlocks b using public.sessions se where b.root_id=root and b.session_token=se.token and se.user_id=p_user;
   end if;
  end if;
  perform public.bom_log(actor.id,p_action,root,jsonb_build_object('user_id',p_user));
 elsif p_action<>'status' then raise check_violation;end if;
 select * into s from public.erp_bom_security where root_id=root;
 unlocked:=public.bom_unlocked(actor.id,p_formula);allowed:=public.bom_allowed(actor.id,p_formula);
 select b.expires_at into expiry from public.erp_bom_unlocks b where b.root_id=root and b.session_token=p_token and b.security_version=s.version and b.expires_at>now();
 return jsonb_build_object('server_time',now(),'root_id',root,'formula_id',p_formula,'owner',is_owner,'can_recover',admin,'allowed',allowed,'initialized',s.password_hash is not null,'unlocked',unlocked,'expires_at',case when unlocked then expiry else null end,'owner_name',(select nama_lengkap from public.users where id=s.owner_id),
 'grants',case when is_owner and unlocked then coalesce((select jsonb_agg(jsonb_build_object('id',g.user_id,'name',u.nama_lengkap)) from public.erp_bom_grants g join public.users u on u.id=g.user_id where g.root_id=root),'[]') else '[]'::jsonb end,
 'candidates',case when is_owner and unlocked then coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.nama_lengkap)) from public.users u where u.id<>s.owner_id and u.is_active and not u.must_change_password and public.erp_can(u.id,'production','read')),'[]') else '[]'::jsonb end);
end $$;

create or replace function public.work_reference_guard() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=nullif(current_setting('inb.actor',true),'')::uuid;d public.erp_deviations;begin
 if actor is null then return new;end if;
 if tg_table_name='erp_capas' then
  select * into d from public.erp_deviations where id=new.deviation_id;
  if not exists(select from public.users where id=new.assignee and is_active and public.erp_can(id,'quality','write')) then raise exception using errcode='P0001',message='Assign CAPA to an active Quality operator.';end if;
 else d:=new;end if;
 if d.material_lot_id is not null and not exists(select from public.erp_material_balances b where b.lot_id=d.material_lot_id and public.work_location_allowed(actor,b.location_id)) then raise insufficient_privilege;end if;
 if d.inspection_id is not null and not exists(select from public.erp_incoming_inspections i join public.erp_material_balances b on b.lot_id=i.lot_id where i.id=d.inspection_id and public.work_location_allowed(actor,b.location_id)) then raise insufficient_privilege;end if;
 if d.manufacturing_order_id is not null and not exists(select from public.erp_manufacturing_orders m where m.id=d.manufacturing_order_id and public.work_location_allowed(actor,m.location_id)) then raise insufficient_privilege;end if;
 if d.manufacturing_order_id is not null then perform public.bom_assert(actor,(select formula_id from public.erp_manufacturing_orders where id=d.manufacturing_order_id));end if;
 return new;
end $$;

-- Raw row builders are private and cannot be called with a spoofed actor through REST.
do $$begin
 if to_regprocedure('public.bom_records_base(uuid,text)') is null then alter function public.work_records(uuid,text) rename to bom_records_base;end if;
 if to_regprocedure('public.bom_genealogy_base(uuid,uuid)') is null then alter function public.work_genealogy(uuid,uuid) rename to bom_genealogy_base;end if;
end $$;
create or replace function public.bom_metadata(actor uuid, formula uuid) returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('bom_server_time',now(),'bom_formula_id',formula,'bom_owner',s.owner_id=actor,'bom_allowed',public.bom_allowed(actor,formula),'bom_initialized',s.password_hash is not null,'bom_unlocked',public.bom_unlocked(actor,formula),'bom_expires_at',case when public.bom_unlocked(actor,formula) then b.expires_at else null end)
 from public.erp_formulas f join public.erp_bom_security s on s.root_id=f.root_id left join public.erp_bom_unlocks b on b.root_id=s.root_id and b.session_token=nullif(current_setting('bom.session',true),'') where f.id=formula
$$;
create or replace function public.work_records(p_user uuid,p_entity text) returns setof jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare r jsonb;formula uuid;orderid uuid;begin
 for r in select * from public.bom_records_base(p_user,p_entity) loop
  formula:=null;
  if p_entity='formulas' then formula:=(r->>'id')::uuid;
  elsif p_entity='manufacturing_orders' then formula:=(r->>'formula_id')::uuid;
  elsif p_entity='deviations' then select formula_id into formula from public.erp_manufacturing_orders where id=nullif(r->>'manufacturing_order_id','')::uuid;
  elsif p_entity='capas' then select m.formula_id into formula from public.erp_deviations d join public.erp_manufacturing_orders m on m.id=d.manufacturing_order_id where d.id=(r->>'deviation_id')::uuid;
  end if;
  if formula is not null then
   if p_entity in ('deviations','capas') then
    if not public.bom_unlocked(p_user,formula) then
     select coalesce(jsonb_object_agg(key,value),'{}') into r from jsonb_each(r) where key=any(array['id','number','state','version','due_date']);
     r:=r||jsonb_build_object('label',r->>'number');
    end if;
    r:=r||public.bom_metadata(p_user,formula);
   end if;
   if p_entity in ('formulas','manufacturing_orders') then
    if not public.bom_unlocked(p_user,formula) or current_setting('work.detail',true)='false' then
     select coalesce(jsonb_object_agg(key,value),'{}') into r from jsonb_each(r) where key=any(array['id','label','number','title','state','version','product','product_id','revision','root_id','unit','unit_id','output_quantity','target_quantity','actual_quantity','yield_percent','scrap_quantity','effective_date','created_at','created_by','created_by_name','approved_by_name','formula_id','location','location_id','warehouse','planned_date']);
    end if;
    r:=r||public.bom_metadata(p_user,formula);
   end if;
  end if;
  return next r;
 end loop;
end $$;
create or replace function public.work_genealogy(p_user uuid,p_lot uuid) returns setof jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare r jsonb;f uuid;begin
 for r in select * from public.bom_genealogy_base(p_user,p_lot) loop
  select formula_id into f from public.erp_manufacturing_orders where id=(r->>'id')::uuid;
  if not public.bom_unlocked(p_user,f) then r:=r-'inputs'||jsonb_build_object('bom_locked',true);end if;
  return next r;
 end loop;
end $$;

create or replace function public.bom_history_events(actor uuid) returns setof public.erp_work_events language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare e public.erp_work_events;f uuid;mo uuid;begin
 for e in select * from public.erp_work_events where
   (entity=current_setting('bom.history_source',true) and record_id=nullif(current_setting('bom.history_target',true),'')::uuid)
   or after_data->>'manufacturing_order_id'=nullif(current_setting('bom.history_target',true),'')
   or after_data->>'transfer_id'=nullif(current_setting('bom.history_target',true),'')
   or after_data->>'pallet_id'=nullif(current_setting('bom.history_target',true),'')
   or before_data->>'manufacturing_order_id'=nullif(current_setting('bom.history_target',true),'')
   or before_data->>'transfer_id'=nullif(current_setting('bom.history_target',true),'')
   or before_data->>'pallet_id'=nullif(current_setting('bom.history_target',true),'') loop
  f:=null;
  if e.entity='formulas' then f:=e.record_id;
  elsif e.entity='capas' then select m.formula_id into f from public.erp_capas c join public.erp_deviations d on d.id=c.deviation_id join public.erp_manufacturing_orders m on m.id=d.manufacturing_order_id where c.id=e.record_id;
  else
   mo:=case when e.entity='manufacturing_orders' then e.record_id else coalesce(nullif(e.after_data->>'manufacturing_order_id',''),nullif(e.before_data->>'manufacturing_order_id',''))::uuid end;
   select formula_id into f from public.erp_manufacturing_orders where id=mo;
  end if;
  if f is not null and not public.bom_unlocked(actor,f) then
   e.before_data:='{"confidential":true}';e.after_data:='{"confidential":true}';e.reason:='Confidential BOM';
  end if;
  return next e;
 end loop;
end $$;

-- Resolve the owning formula before any operation or idempotent request replay.
create or replace function public.bom_guard_command(actor uuid,action text,p jsonb) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare f uuid;mo uuid;target uuid:=nullif(p->>'id','')::uuid;begin
 if action='save_formula' and target is null then
  if current_setting('bom.creating',true) is distinct from 'true' then raise exception using errcode='P0001',message='Set a BOM password when creating a formula.';end if;return;
 elsif action in ('save_formula','revise_formula','approve_formula','withdraw_formula') then f:=target;
 elsif action='create_manufacturing_order' then f:=(p->>'formula_id')::uuid;
 elsif action in ('reserve_manufacturing_material','release_material_reservation','consume_material','return_manufacturing_material','record_manufacturing_output','release_manufacturing_order','complete_manufacturing_order','close_manufacturing_order','cancel_manufacturing_order') then
  mo:=target;
  if action in ('release_material_reservation','consume_material') then select manufacturing_order_id into mo from public.erp_material_reservations where id=target;
  elsif action='return_manufacturing_material' then select manufacturing_order_id into mo from public.erp_manufacturing_inputs where id=target;end if;
  select formula_id into f from public.erp_manufacturing_orders where id=mo;
 else return;end if;
 if f is null then raise no_data_found;end if;
 perform public.bom_assert(actor,f);
end $$;

create or replace function public.erp_bom_create(p_token text,p_payload jsonb,p_password text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor public.users;result jsonb;status jsonb;begin
 actor:=public.erp_actor(p_token);perform public.bom_check_password(p_password);
 if nullif(p_payload->>'id','') is not null then raise check_violation;end if;
 perform set_config('bom.creating','true',true);
 result:=public.erp_work_mutate(p_token,'save_formula',p_payload);
 perform set_config('bom.creating','',true);
 if not exists(select from public.erp_bom_security s join public.erp_formulas f on f.root_id=s.root_id where f.id=(result->>'id')::uuid and s.password_hash is not null) then
  status:=public.erp_bom_security(p_token,'setup',(result->>'id')::uuid,p_password);
 end if;
 -- A replay returns identity only; it never performs an unlock or bypasses rate limits.
 return result;
end $$;

create or replace function public.bom_material_transaction(r jsonb) returns uuid language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare tx uuid;value text:=coalesce(r->>'transaction_id',r->>'id');begin
 if value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return value::uuid;end if;
 if value ~ '^[0-9]{1,18}$' then select transaction_id into tx from public.erp_material_ledger where id=value::bigint;end if;
 return tx;
end $$;
-- Apply the confidentiality predicate before every legacy location/administrator shortcut.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.work_row_allowed(uuid,text,jsonb)'::regprocedure);
 -- Strip this migration's previous guard when reapplied; replace it atomically below.
 if position('/* bom_material_scope */' in definition)>0 then
  definition:=substring(definition from 1 for position(' /* bom_material_scope */' in definition)-1)||substring(definition from position(' if p_user is null or' in definition));
 end if;
 if position(' if p_user is null or' in definition)=0 then raise exception 'Unexpected row authorization implementation';end if;
 definition:=replace(definition,' if p_user is null or',E' /* bom_material_scope */\n if r?''body'' then r:=r->''body'';end if;\n if p_entity in (''material_ledger'',''ops_material_receipts'') and exists(select from public.erp_manufacturing_inputs i join public.erp_manufacturing_orders m on m.id=i.manufacturing_order_id where i.transaction_id=public.bom_material_transaction(r) and not public.bom_unlocked(p_user,m.formula_id)) then return false;end if;\n if p_entity=''material_ledger'' then return exists(select from public.erp_material_ledger g where g.transaction_id=public.bom_material_transaction(r) and public.work_location_allowed(p_user,g.location_id));end if;\n if p_user is null or');
 execute definition;
 definition:=pg_get_functiondef('public.work_read_base(text,text,jsonb)'::regprocedure);
 if position('public.bom_history_events' in definition)=0 then
  if position('from public.erp_work_events e join' in definition)=0 then raise exception 'Unexpected work history implementation';end if;
  definition:=replace(definition,'from public.erp_work_events e join','from public.bom_history_events(nullif(current_setting(''''work.actor'''',true),'''''''')::uuid) e join');execute definition;
 end if;
 if position('bom.history_source' in definition)=0 then
  if position('source_entity:=p_query->>''source'';' in definition)=0 then raise exception 'Unexpected work history scope';end if;
  definition:=replace(definition,'source_entity:=p_query->>''source'';',E'source_entity:=p_query->>''source'';perform set_config(''bom.history_source'',source_entity,true);perform set_config(''bom.history_target'',target,true);');execute definition;
 end if;
 definition:=pg_get_functiondef('public.erp_work_mutate(text,text,jsonb)'::regprocedure);
 if position('bom_guard_command' in definition)=0 then
  if position(' select * into prior' in definition)=0 then raise exception 'Unexpected work mutation implementation';end if;
  definition:=replace(definition,' select * into prior',E' perform public.bom_guard_command(u.id,p_action,p_payload);\n select * into prior');execute definition;
 end if;
 definition:=pg_get_functiondef('public.erp_work_document(text,text,uuid)'::regprocedure);
 if position('public.bom_assert' in definition)=0 then
  definition:=replace(definition,' if p_entity=''manufacturing_orders'' then',E' if p_entity=''manufacturing_orders'' then\n  perform public.bom_assert(u.id,(select formula_id from public.erp_manufacturing_orders where id=p_id));');execute definition;
 end if;

end $$;

-- Audit metadata is safe; detailed production/material rows require the same BOM unlock.
create or replace function public.erp_bom_audit(p_token text,p_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor public.users;r public.audit_log;f uuid;tx uuid;begin
 actor:=public.erp_actor(p_token);
 if not public.erp_qc_can(actor.id,'read_audit') then raise insufficient_privilege;end if;
 select * into r from public.audit_log where id=p_id;if not found then raise no_data_found;end if;
 if r.aksi like '%erp_formulas' then f:=coalesce(r.after_data->>'id',r.before_data->>'id')::uuid;
 elsif r.aksi like '%erp_manufacturing%' or r.aksi like '%erp_material_transactions' then
  if r.aksi like '%erp_material_transactions' then
   tx:=coalesce(r.after_data->>'id',r.before_data->>'id')::uuid;
   select m.formula_id into f from public.erp_manufacturing_inputs i join public.erp_manufacturing_orders m on m.id=i.manufacturing_order_id where i.transaction_id=tx;
  else select formula_id into f from public.erp_manufacturing_orders where id=coalesce(r.after_data->>'manufacturing_order_id',r.before_data->>'manufacturing_order_id',r.after_data->>'id',r.before_data->>'id')::uuid;end if;
 end if;
 if f is not null and not public.bom_unlocked(actor.id,f) then r.before_data:='{"confidential":true}';r.after_data:='{"confidential":true}';end if;
 return to_jsonb(r);
end $$;

-- Only the session-verified entry points are callable by the application service role.
do $$declare t text;f regprocedure;begin
 foreach t in array array['erp_bom_security','erp_bom_grants','erp_bom_unlocks','erp_bom_attempts'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'bom_%' or p.proname in ('erp_bom_security','erp_bom_create','erp_bom_audit','erp_actor','work_records','work_genealogy')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
 end loop;
end $$;
grant execute on function public.erp_bom_security(text,text,uuid,text,uuid,text),public.erp_bom_create(text,jsonb,text),public.erp_bom_audit(text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
