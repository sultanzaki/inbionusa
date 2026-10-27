begin;
-- Operational equipment. New assets require a recorded clean inspection before use.
create table if not exists public.erp_equipment(
 id uuid primary key default gen_random_uuid(),code text unique not null check(length(btrim(code))>0),name text not null check(length(btrim(name))>0),
 location_id uuid not null references public.erp_locations(id),serial_number text not null default '',capacity text not null default '',
 state text not null default 'dirty' check(state in ('dirty','cleaning','ready','in_use','repair','inactive')),version integer not null default 1);
create table if not exists public.erp_equipment_uses(
 id uuid primary key default gen_random_uuid(),equipment_id uuid not null references public.erp_equipment(id),
 manufacturing_order_id uuid references public.erp_manufacturing_orders(id),movement_id uuid references public.erp_movements(id),
 operator_id uuid not null references public.users(id),started_at timestamptz not null default now(),finished_at timestamptz,
 check(num_nonnulls(manufacturing_order_id,movement_id)=1));
create unique index if not exists equipment_one_use on public.erp_equipment_uses(equipment_id) where finished_at is null;
create table if not exists public.erp_equipment_cleaning(
 id uuid primary key default gen_random_uuid(),equipment_id uuid not null references public.erp_equipment(id),
 cleaned_by uuid not null references public.users(id),inspected_by uuid not null references public.users(id),
 method text not null check(length(btrim(method))>0),agent text not null default '',condition text not null check(length(btrim(condition))>0),
 result text not null check(result in ('pass','fail')),reason text not null check(length(btrim(reason))>=3),
 started_at timestamptz not null,finished_at timestamptz not null default now(),check(finished_at>=started_at));
alter table public.erp_equipment_cleaning add column if not exists usage_id uuid references public.erp_equipment_uses(id);
alter table public.erp_equipment add column if not exists cleaning_started_at timestamptz;
-- These tables are reachable only through authenticated operational RPCs.
alter table public.erp_equipment enable row level security;
alter table public.erp_equipment_uses enable row level security;
alter table public.erp_equipment_cleaning enable row level security;
revoke all on public.erp_equipment,public.erp_equipment_uses,public.erp_equipment_cleaning from public,anon,authenticated,service_role;
create or replace function public.equipment_command(p_token text,p_action text,p jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor public.users;e public.erp_equipment;target uuid:=nullif(p->>'id','')::uuid;before_row jsonb;result uuid;mo uuid;mv uuid;loc uuid;st text;cleaner uuid;inspector uuid;begin
 perform pg_advisory_xact_lock(49281041);actor:=public.erp_actor(p_token);perform public.erp_assert(actor.id,'production','write');
 if p_action='save_equipment' and target is null then
  perform public.work_assert_location(actor.id,(p->>'location_id')::uuid,'write');
  insert into public.erp_equipment(code,name,location_id,serial_number,capacity) values(btrim(p->>'code'),btrim(p->>'name'),(p->>'location_id')::uuid,coalesce(p->>'serial_number',''),coalesce(p->>'capacity','')) returning id into result;
 else
  select * into e from public.erp_equipment where id=target for update;if not found then raise no_data_found;end if;
  perform public.work_assert_location(actor.id,e.location_id,'write');before_row:=to_jsonb(e);
  if (p->>'version')::integer is distinct from e.version then raise exception 'This equipment changed. Reload and retry.';end if;
  result:=e.id;
  if p_action='save_equipment' then
   if e.state='in_use' then raise exception 'Finish equipment use before editing.';end if;
   perform public.work_assert_location(actor.id,(p->>'location_id')::uuid,'write');
   update public.erp_equipment set code=btrim(p->>'code'),name=btrim(p->>'name'),location_id=(p->>'location_id')::uuid,serial_number=coalesce(p->>'serial_number',''),capacity=coalesce(p->>'capacity','') where id=e.id;
  elsif p_action='start_equipment_cleaning' then
   if e.state not in ('dirty','repair','ready') then raise exception 'Equipment must be idle before cleaning.';end if;
   update public.erp_equipment set state='cleaning',cleaning_started_at=now() where id=e.id;
  elsif p_action='finish_equipment_cleaning' then
   if e.state<>'cleaning' then raise exception 'Start cleaning before recording inspection.';end if;
   cleaner:=(p->>'cleaned_by')::uuid;inspector:=(p->>'inspected_by')::uuid;
   if not exists(select from public.users where id=cleaner and is_active and public.erp_can(id,'production','write')) or not exists(select from public.users where id=inspector and is_active and public.erp_can(id,'production','write')) then raise insufficient_privilege;end if;
   insert into public.erp_equipment_cleaning(equipment_id,cleaned_by,inspected_by,method,agent,condition,result,reason,started_at,usage_id) values(e.id,cleaner,inspector,p->>'method',coalesce(p->>'agent',''),p->>'condition',p->>'result',p->>'reason',e.cleaning_started_at,(select id from public.erp_equipment_uses where equipment_id=e.id order by started_at desc,id desc limit 1));
   update public.erp_equipment set state=case when p->>'result'='pass' then 'ready' else 'repair' end,cleaning_started_at=null where id=e.id;
  elsif p_action='use_equipment' then
   if e.state<>'ready' then raise exception 'Equipment must be clean and fit for use.';end if;
   mo:=nullif(p->>'manufacturing_order_id','')::uuid;mv:=nullif(p->>'movement_id','')::uuid;
   if num_nonnulls(mo,mv)<>1 then raise exception 'Choose exactly one production order or production record.';end if;
   if mo is not null then
    select location_id,state into loc,st from public.erp_manufacturing_orders where id=mo for update;
    perform public.bom_assert(actor.id,(select formula_id from public.erp_manufacturing_orders where id=mo));
   else select to_location,state into loc,st from public.erp_movements where id=mv and kind='production' for update;end if;
   if loc is null or loc<>e.location_id or st not in ('draft','released','in_progress') then raise exception 'Choose an open batch at the equipment location.';end if;
   perform public.work_assert_location(actor.id,loc,'write');
   insert into public.erp_equipment_uses(equipment_id,manufacturing_order_id,movement_id,operator_id) values(e.id,mo,mv,actor.id);
   update public.erp_equipment set state='in_use' where id=e.id;
  elsif p_action='finish_equipment_use' then
   if e.state<>'in_use' then raise exception 'Equipment is not in use.';end if;
   update public.erp_equipment_uses set finished_at=now() where equipment_id=e.id and finished_at is null;
   update public.erp_equipment set state='dirty' where id=e.id;
  else raise exception 'Unknown equipment operation.';end if;
  update public.erp_equipment set version=version+1 where id=e.id;
 end if;
 perform public.work_event('equipment',result,p_action,actor.id,coalesce(p->>'reason',''),before_row,(select to_jsonb(x) from public.erp_equipment x where id=result));
 return jsonb_build_object('id',result,'entity','equipment');
end $$;
revoke all on function public.equipment_command(text,text,jsonb) from public,anon,authenticated,service_role;
-- Integrate the existing gateway without changing its BOM authorization or replay logic.
do $$begin
 if to_regprocedure('public.equipment_mutate_base(text,text,jsonb)') is null then alter function public.erp_work_mutate(text,text,jsonb) rename to equipment_mutate_base;end if;
 if to_regprocedure('public.equipment_records_base(uuid,text)') is null then alter function public.work_records(uuid,text) rename to equipment_records_base;end if;
 if to_regprocedure('public.equipment_module_base(text)') is null then alter function public.work_module(text) rename to equipment_module_base;end if;
end $$;
create or replace function public.work_module(p_entity text) returns text language sql immutable as $$select case when p_entity in ('equipment','equipment_production_records') then 'production' else public.equipment_module_base(p_entity) end$$;
create or replace function public.work_records(p_user uuid,p_entity text) returns setof jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$declare row_data jsonb;begin
 if p_entity='equipment' then
 return query select to_jsonb(e)||jsonb_build_object('label',e.code||' · '||e.name,'location',l.name,'uses',coalesce((select jsonb_agg(to_jsonb(u)||jsonb_build_object('operator',(select nama_lengkap from public.users where id=u.operator_id),'batch',coalesce((select number from public.erp_manufacturing_orders where id=u.manufacturing_order_id),(select number from public.erp_movements where id=u.movement_id)))) from public.erp_equipment_uses u where u.equipment_id=e.id),'[]'),'cleaning',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('cleaner',(select nama_lengkap from public.users where id=c.cleaned_by),'inspector',(select nama_lengkap from public.users where id=c.inspected_by))) from public.erp_equipment_cleaning c where c.equipment_id=e.id),'[]')) from public.erp_equipment e join public.erp_locations l on l.id=e.location_id where public.work_location_allowed(p_user,e.location_id);
 elsif p_entity='equipment_production_records' then return query select jsonb_build_object('id',id,'label',number,'state',state) from public.erp_movements where kind='production' and state='draft' and public.work_location_allowed(p_user,to_location);
 else
 for row_data in select * from public.equipment_records_base(p_user,p_entity) loop
  if p_entity='manufacturing_orders' then
   row_data:=row_data||jsonb_build_object('equipment',coalesce((select jsonb_agg(to_jsonb(u)||jsonb_build_object('equipment',e.code||' · '||e.name,'operator',(select nama_lengkap from public.users where id=u.operator_id),'cleaning',(select jsonb_agg(to_jsonb(c)) from public.erp_equipment_cleaning c where c.usage_id=u.id))) from public.erp_equipment_uses u join public.erp_equipment e on e.id=u.equipment_id where u.manufacturing_order_id=(row_data->>'id')::uuid),'[]'));
  end if;return next row_data;
 end loop;end if;
end $$;
create or replace function public.erp_work_mutate(p_token text,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$declare u public.users;prior public.erp_work_requests;r jsonb;begin
 if p_action not in ('save_equipment','start_equipment_cleaning','finish_equipment_cleaning','use_equipment','finish_equipment_use') then
  if p_action='record_manufacturing_output' then perform set_config('equipment.mo',p_payload->>'id',true);end if;
  r:=public.equipment_mutate_base(p_token,p_action,p_payload);
  perform set_config('equipment.mo','',true);return r;end if;
 perform pg_advisory_xact_lock(49281041);u:=public.erp_actor(p_token);
 if nullif(p_payload->>'request_key','') is null or length(p_payload::text)>16000 then raise check_violation;end if;
 select * into prior from public.erp_work_requests where request_key=(p_payload->>'request_key')::uuid;
 if found then if prior.actor_id<>u.id or prior.action<>p_action or prior.payload<>p_payload then raise check_violation;end if;return prior.result;end if;
 r:=public.equipment_command(p_token,p_action,p_payload);
 insert into public.erp_work_requests values((p_payload->>'request_key')::uuid,u.id,p_action,p_payload,r,now());return r;
end $$;
revoke all on function public.equipment_mutate_base(text,text,jsonb),public.equipment_records_base(uuid,text),public.equipment_module_base(text),public.work_records(uuid,text),public.work_module(text) from public,anon,authenticated,service_role;
revoke all on function public.erp_work_mutate(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.erp_work_mutate(text,text,jsonb) to service_role;
-- Enforce readiness inside PostgreSQL for every production entry path.
create or replace function public.equipment_batch_guard() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare mo uuid;begin
 perform pg_advisory_xact_lock(49281041);
 if tg_table_name='erp_manufacturing_orders' then
  if new.state in ('released','in_progress') and new.state is distinct from old.state then
   if not exists(select from public.erp_equipment_uses u join public.erp_equipment e on e.id=u.equipment_id where u.manufacturing_order_id=new.id and u.finished_at is null and e.state='in_use') then raise exception 'Assign clean, inspected equipment before starting production.';end if;
  end if;
  if new.state in ('completed','closed','cancelled') and new.state is distinct from old.state then
   update public.erp_equipment set state='dirty',version=version+1 where id in (select equipment_id from public.erp_equipment_uses where manufacturing_order_id=new.id and finished_at is null);
   update public.erp_equipment_uses set finished_at=now() where manufacturing_order_id=new.id and finished_at is null;
  end if;
 elsif new.kind='production' and new.state='posted' and old.state is distinct from new.state then
  mo:=nullif(current_setting('equipment.mo',true),'')::uuid;
  if not exists(select from public.erp_equipment_uses u join public.erp_equipment e on e.id=u.equipment_id where u.finished_at is null and e.state='in_use' and ((mo is null and u.movement_id=new.id) or (mo is not null and u.manufacturing_order_id=mo))) then raise exception 'Assign clean, inspected equipment before posting production.';end if;
  if mo is null then
   update public.erp_equipment set state='dirty',version=version+1 where id in (select equipment_id from public.erp_equipment_uses where movement_id=new.id and finished_at is null);
   update public.erp_equipment_uses set finished_at=now() where movement_id=new.id and finished_at is null;
  end if;
 end if;
 return new;
end $$;
drop trigger if exists equipment_batch_guard on public.erp_manufacturing_orders;
create trigger equipment_batch_guard before update on public.erp_manufacturing_orders for each row execute function public.equipment_batch_guard();
drop trigger if exists equipment_batch_guard on public.erp_movements;
create trigger equipment_batch_guard before update on public.erp_movements for each row execute function public.equipment_batch_guard();
revoke all on function public.equipment_batch_guard() from public,anon,authenticated,service_role;
create or replace function public.equipment_consumption_guard() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$begin
 if new.kind='consume' and not exists(select from public.erp_equipment_uses u join public.erp_equipment e on e.id=u.equipment_id where u.manufacturing_order_id=new.manufacturing_order_id and u.finished_at is null and e.state='in_use') then raise exception 'Assign clean, inspected equipment before consuming production materials.';end if;
 return new;
end $$;
drop trigger if exists equipment_consumption_guard on public.erp_manufacturing_inputs;
create trigger equipment_consumption_guard before insert on public.erp_manufacturing_inputs for each row execute function public.equipment_consumption_guard();
revoke all on function public.equipment_consumption_guard() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
