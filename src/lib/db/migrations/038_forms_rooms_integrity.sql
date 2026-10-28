begin;
set local lock_timeout='15s';
select pg_advisory_xact_lock(49281041);
-- Prevent inactive rooms from trapping unfinished operations, even when stock is zero.
create or replace function public.places_room_busy(p_room uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select from public.erp_balances where location_id=p_room and quantity>0)
 or exists(select from public.erp_material_balances where location_id=p_room and quantity>0)
 or exists(select from public.erp_counts where location_id=p_room and state in ('draft','counting','submitted'))
 or exists(select from public.erp_movements where state='draft' and p_room in(from_location,to_location))
 or exists(select from public.erp_warehouse_transfers where p_room in(from_location,to_location) and state in ('draft','in_transit','partial'))
 or exists(select from public.erp_manufacturing_orders where location_id=p_room and state in ('draft','released','in_progress','completed'))
 or exists(select from public.erp_material_reservations where location_id=p_room and state='active' and remaining>0)
 or exists(select from public.erp_reservations where location_id=p_room and state='active' and remaining>0)
 or exists(select from public.erp_returns where location_id=p_room and state in ('requested','received'))
 or exists(select from public.erp_sample_requests where location_id=p_room and state in ('approved','prepared'))
 or exists(select from public.erp_pallets where location_id=p_room and state in ('packed','in_transit'))
 or exists(select from public.erp_equipment where location_id=p_room and state in ('in_use','cleaning'))
$$;
revoke all on function public.places_room_busy(uuid) from public,anon,authenticated,service_role;
create or replace function public.places_save(p_actor uuid,p_action text,p jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare target uuid:=nullif(p->>'id','')::uuid;site uuid;site_row public.erp_warehouses;room public.erp_locations;title text:=btrim(p->>'name');room_title text:=btrim(coalesce(p->>'room_name',p->>'name'));kind text:=coalesce(nullif(p->>'room_kind',''),'warehouse');enabled boolean:=coalesce((p->>'active')::boolean,true);before_row jsonb;entity text;begin
 if not exists(select from public.users where id=p_actor and is_active and role in ('admin qc','administrator inbionusa')) then raise insufficient_privilege;end if;
 if p_action='save_warehouse' then
  if coalesce(length(title),0) not between 1 and 100 or position('/' in title)>0 then raise exception 'Enter a site name of up to 100 characters without /.';end if;
  if target is null then
   insert into public.erp_warehouses(code,name,address,active) values('SITE-'||substr(gen_random_uuid()::text,1,24),title,coalesce(p->>'address',''),enabled) returning id into target;
  else
   select * into site_row from public.erp_warehouses where id=target for update;if not found then raise no_data_found;end if;
   if site_row.version is distinct from (p->>'version')::integer then raise exception 'The site changed. Reload before saving.';end if;
   if not enabled and exists(select from public.erp_locations l where l.warehouse_id=target and public.places_room_busy(l.id)) then raise exception 'Resolve stock and open operations before deactivating this site.';end if;
   before_row:=to_jsonb(site_row);
   update public.erp_warehouses set name=title,address=coalesce(p->>'address',''),active=enabled,version=version+1 where id=target;
   update public.erp_locations set name=title||'/'||room_name where warehouse_id=target and name is distinct from title||'/'||room_name;
  end if;entity:='warehouses';
 elsif p_action='save_warehouse_location' then
  site:=(p->>'warehouse_id')::uuid;
  if coalesce(length(room_title),0) not between 1 and 100 or position('/' in room_title)>0 then raise exception 'Enter a room name of up to 100 characters without /.';end if;
  if kind not in ('warehouse','laboratory','production','office','other') then raise check_violation;end if;
  select * into site_row from public.erp_warehouses where id=site for share;
  if not found or (enabled and not site_row.active) then raise exception 'Choose an active site.';end if;
  if target is null then
   insert into public.erp_locations(code,name,room_name,room_kind,warehouse_id,active) values(null,room_title,room_title,kind,site,enabled) returning id into target;
  else
   select * into room from public.erp_locations where id=target for update;if not found then raise no_data_found;end if;
   if room.version is distinct from (p->>'version')::integer then raise exception 'The room changed. Reload before saving.';end if;
   if room.warehouse_id<>site then raise exception 'Create a new room for a different site. Room history stays at its original site.';end if;
   if not enabled and public.places_room_busy(target) then raise exception 'Resolve stock and open operations before deactivating this room.';end if;
   before_row:=to_jsonb(room);
   update public.erp_locations set room_name=room_title,name=site_row.name||'/'||room_title,room_kind=kind,active=enabled where id=target;
  end if;entity:='locations';
 else raise check_violation;end if;
 perform public.work_event(entity,target,p_action,p_actor,'Site and room administration',coalesce(before_row,'{}'),case when entity='warehouses' then (select to_jsonb(w) from public.erp_warehouses w where id=target) else (select to_jsonb(l) from public.erp_locations l where id=target) end);
 return jsonb_build_object('id',target,'entity',entity);
end $$;
revoke all on function public.places_save(uuid,text,jsonb) from public,anon,authenticated,service_role;

-- Enforce these rules for legacy APIs and direct write paths too, not only the new screen.
create or replace function public.places_lifecycle_guard() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$begin
 if tg_table_name='erp_locations' then
  if new.warehouse_id is distinct from old.warehouse_id then raise exception 'Create a new room for a different site. Room history stays at its original site.';end if;
  if old.active and not new.active and public.places_room_busy(old.id) then raise exception 'Resolve stock and open operations before deactivating this room.';end if;
 else
  if old.active and not new.active and exists(select from public.erp_locations l where l.warehouse_id=old.id and public.places_room_busy(l.id)) then raise exception 'Resolve stock and open operations before deactivating this site.';end if;
 end if;
 return new;
end $$;
revoke all on function public.places_lifecycle_guard() from public,anon,authenticated,service_role;
-- Acquire the common lock before row locks, matching the mutation gateways.
create or replace function public.places_write_lock() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$begin
 perform pg_advisory_xact_lock(49281041);return null;
end $$;
revoke all on function public.places_write_lock() from public,anon,authenticated,service_role;
drop trigger if exists places_write_lock on public.erp_locations;
create trigger places_write_lock before update of active,warehouse_id on public.erp_locations for each statement execute function public.places_write_lock();
drop trigger if exists places_write_lock on public.erp_warehouses;
create trigger places_write_lock before update of active on public.erp_warehouses for each statement execute function public.places_write_lock();
drop trigger if exists places_lifecycle_guard on public.erp_locations;
create trigger places_lifecycle_guard before update of active,warehouse_id on public.erp_locations for each row execute function public.places_lifecycle_guard();
drop trigger if exists places_lifecycle_guard on public.erp_warehouses;
create trigger places_lifecycle_guard before update of active on public.erp_warehouses for each row execute function public.places_lifecycle_guard();
-- Generic equipment references must use the same active site/room rule as cleaning forms.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.erp_form_reference_rows(uuid,text,text,integer,uuid)'::regprocedure);
 if position('/* active equipment room */' in definition)=0 then
  if position('where e.state<>''inactive'' and public.work_location_allowed' in definition)=0 then raise exception 'Unexpected equipment reference implementation';end if;
  definition:=replace(definition,'where e.state<>''inactive'' and public.work_location_allowed', 'where /* active equipment room */ l.active and exists(select from public.erp_warehouses w where w.id=l.warehouse_id and w.active) and e.state<>''inactive'' and public.work_location_allowed');
  execute definition;
 end if;
end $$;
-- Replays distinguish the original stored attachments from uploads of a losing retry.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.erp_form_submit(uuid,integer,uuid,text,jsonb,jsonb,jsonb,boolean)'::regprocedure);
 if position('attachments_committed' in definition)=0 then
  if position('if existing is not null then return existing;end if;' in definition)=0 then raise exception 'Unexpected submission replay implementation';end if;
  definition:=replace(definition,'if existing is not null then return existing;end if;', $patch$if existing is not null then return existing||jsonb_build_object('attachments_committed',(select files=p_files from public.erp_form_submissions where id=(existing->>'id')::uuid));end if;$patch$);
  execute definition;
 end if;
end $$;
-- Idempotent administration commands: a retry after a lost response must not create a second form.
create or replace function public.erp_form_command(p_token text,p_action text,p_request uuid,p_id uuid default null,p_template jsonb default null,p_version integer default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor public.users;prior public.erp_work_requests;payload jsonb:=jsonb_build_object('id',p_id,'template',p_template,'version',p_version);result jsonb;begin
 perform pg_advisory_xact_lock(49281041);
 actor:=public.erp_actor(p_token);
 if actor.role not in ('admin qc','administrator inbionusa') then raise insufficient_privilege;end if;
 if p_request is null then raise check_violation;end if;
 select * into prior from public.erp_work_requests where request_key=p_request;
 if found then
  if prior.actor_id<>actor.id or prior.action<>'forms:'||p_action or prior.payload<>payload then raise exception 'This request identifier has already been used. Reload the form.';end if;
  return prior.result;
 end if;
 result:=public.erp_forms_admin(p_token,p_action,p_id,p_template,p_version);
 if p_action='create' then perform public.work_event('forms',(result->>'id')::uuid,'create',actor.id,'Form administration','{}',jsonb_build_object('version',1));end if;
 insert into public.erp_work_requests values(p_request,actor.id,'forms:'||p_action,payload,result,now());
 return result;
end $$;
revoke all on function public.erp_form_command(text,text,uuid,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.erp_form_command(text,text,uuid,uuid,jsonb,integer) to service_role;
notify pgrst,'reload schema';
commit;
