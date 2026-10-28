begin;
set local lock_timeout='15s';
select pg_advisory_xact_lock(49281041);
-- Existing warehouse IDs now represent physical sites; locations are their typed rooms.
-- Retain legacy table/FK names so stock, access scopes, equipment and history keep their identities.
alter table public.erp_locations add column if not exists room_name text;
alter table public.erp_locations add column if not exists room_kind text not null default 'warehouse' check(room_kind in ('warehouse','laboratory','production','office','other'));
alter table public.erp_locations add column if not exists version integer not null default 1;
update public.erp_locations l set room_name=case when starts_with(l.name,w.name||'/') then substr(l.name,length(w.name)+2) else l.name end from public.erp_warehouses w where w.id=l.warehouse_id and l.room_name is null;
alter table public.erp_locations alter column room_name set not null;
alter table public.erp_locations drop constraint if exists erp_locations_name_check;
alter table public.erp_locations add constraint erp_locations_name_check check(length(btrim(name)) between 1 and 240);
create unique index if not exists places_site_name on public.erp_warehouses(lower(btrim(name)));
create unique index if not exists places_room_name on public.erp_locations(warehouse_id,lower(btrim(room_name)));
create or replace function public.work_location_sync() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare site_name text;begin
 if tg_op='UPDATE' and new.warehouse_id<>old.warehouse_id and (exists(select from public.erp_ledger where location_id=old.id) or exists(select from public.erp_material_ledger where location_id=old.id)) then raise exception 'A location with stock history cannot move to another site.';end if;
 if new.warehouse_id is null then select id into new.warehouse_id from public.erp_warehouses where name=new.warehouse and active;end if;
 select name into site_name from public.erp_warehouses where id=new.warehouse_id;
 if site_name is null then raise exception 'Pilih tempat yang terdaftar.';end if;
 if tg_op='INSERT' then new.room_name:=coalesce(nullif(btrim(new.room_name),''),btrim(new.name));
 elsif new.name is distinct from old.name and new.room_name is not distinct from old.room_name then
  new.room_name:=case when starts_with(new.name,site_name||'/') then substr(new.name,length(site_name)+2) else new.name end;
 end if;
 new.room_name:=btrim(new.room_name);
 if coalesce(length(new.room_name),0) not between 1 and 100 then raise check_violation using message='Nama ruangan harus diisi, maksimal 100 karakter.';end if;
 new.warehouse:=site_name;new.name:=site_name||'/'||new.room_name;
 new.code:=coalesce(nullif(btrim(new.code),''),'LOC-'||substr(gen_random_uuid()::text,1,24));
 if tg_op='UPDATE' then new.version:=old.version+1;end if;
 return new;
end $$;
update public.erp_locations l set name=w.name||'/'||l.room_name from public.erp_warehouses w where w.id=l.warehouse_id and l.name is distinct from w.name||'/'||l.room_name;
create or replace function public.places_room_busy(p_room uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select from public.erp_balances where location_id=p_room and quantity>0)
 or exists(select from public.erp_material_balances where location_id=p_room and quantity>0)
 or exists(select from public.erp_counts where location_id=p_room and state in ('draft','counting','submitted'))
 or exists(select from public.erp_movements where state='draft' and p_room in(from_location,to_location))
 or exists(select from public.erp_warehouse_transfers where p_room in(from_location,to_location) and state in ('draft','in_transit','partial'))
 or exists(select from public.erp_manufacturing_orders where location_id=p_room and state in ('draft','released','in_progress'))
 or exists(select from public.erp_equipment where location_id=p_room and state in ('in_use','cleaning'))
$$;
revoke all on function public.places_room_busy(uuid) from public,anon,authenticated,service_role;
create or replace function public.places_save(p_actor uuid,p_action text,p jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare target uuid:=nullif(p->>'id','')::uuid;site uuid;site_row public.erp_warehouses;room public.erp_locations;title text:=btrim(p->>'name');room_title text:=btrim(coalesce(p->>'room_name',p->>'name'));kind text:=coalesce(nullif(p->>'room_kind',''),'warehouse');enabled boolean:=coalesce((p->>'active')::boolean,true);before_row jsonb;entity text;begin
 if not exists(select from public.users where id=p_actor and is_active and role in ('admin qc','administrator inbionusa')) then raise insufficient_privilege;end if;
 if p_action='save_warehouse' then
  if coalesce(length(title),0) not between 1 and 100 or position('/' in title)>0 then raise exception 'Isi nama tempat tanpa tanda /, maksimal 100 karakter.';end if;
  if target is null then
   insert into public.erp_warehouses(code,name,address,active) values('SITE-'||substr(gen_random_uuid()::text,1,24),title,coalesce(p->>'address',''),enabled) returning id into target;
  else
   select * into site_row from public.erp_warehouses where id=target for update;if not found then raise no_data_found;end if;
   if site_row.version is distinct from (p->>'version')::integer then raise exception 'Tempat telah berubah. Muat ulang sebelum menyimpan.';end if;
   if not enabled and exists(select from public.erp_locations l where l.warehouse_id=target and public.places_room_busy(l.id)) then raise exception 'Selesaikan stok dan kegiatan aktif sebelum menonaktifkan tempat.';end if;
   before_row:=to_jsonb(site_row);
   update public.erp_warehouses set name=title,address=coalesce(p->>'address',''),active=enabled,version=version+1 where id=target;
   update public.erp_locations set name=title||'/'||room_name where warehouse_id=target and name is distinct from title||'/'||room_name;
  end if;entity:='warehouses';
 elsif p_action='save_warehouse_location' then
  site:=(p->>'warehouse_id')::uuid;
  if coalesce(length(room_title),0) not between 1 and 100 or position('/' in room_title)>0 then raise exception 'Isi nama ruangan tanpa tanda /, maksimal 100 karakter.';end if;
  if kind not in ('warehouse','laboratory','production','office','other') then raise check_violation;end if;
  select * into site_row from public.erp_warehouses where id=site for share;
  if not found or (enabled and not site_row.active) then raise exception 'Pilih tempat yang aktif.';end if;
  if target is null then
   insert into public.erp_locations(code,name,room_name,room_kind,warehouse_id,active) values(null,room_title,room_title,kind,site,enabled) returning id into target;
  else
   select * into room from public.erp_locations where id=target for update;if not found then raise no_data_found;end if;
   if room.version is distinct from (p->>'version')::integer then raise exception 'Ruangan telah berubah. Muat ulang sebelum menyimpan.';end if;
   if room.warehouse_id<>site then raise exception 'Buat ruangan baru untuk tempat berbeda. Riwayat ruangan tetap pada tempat asal.';end if;
   if not enabled and public.places_room_busy(target) then raise exception 'Selesaikan stok dan kegiatan aktif sebelum menonaktifkan ruangan.';end if;
   before_row:=to_jsonb(room);
   update public.erp_locations set room_name=room_title,name=site_row.name||'/'||room_title,room_kind=kind,active=enabled where id=target;
  end if;entity:='locations';
 else raise check_violation;end if;
 perform public.work_event(entity,target,p_action,p_actor,'Site and room administration',coalesce(before_row,'{}'),case when entity='warehouses' then (select to_jsonb(w) from public.erp_warehouses w where id=target) else (select to_jsonb(l) from public.erp_locations l where id=target) end);
 return jsonb_build_object('id',target,'entity',entity);
end $$;
revoke all on function public.places_save(uuid,text,jsonb) from public,anon,authenticated,service_role;
-- Keep request replay checks of the existing mutation gateway and all stock-specific behavior.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.work_warehouse_command(text,uuid,text,jsonb)'::regprocedure);
 if position('public.places_save' in definition)=0 then
  definition:=replace(definition,' perform public.erp_assert(p_user,''warehouse'',',' if p_action in (''save_warehouse'',''save_warehouse_location'') then return public.places_save(p_user,p_action,p);end if; perform public.erp_assert(p_user,''warehouse'',');
  execute definition;
 end if;
end $$;
create or replace function public.erp_places_admin(p_token text,p_action text,p jsonb default '{}') returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor public.users;page integer:=coalesce((p->>'page')::integer,1);site uuid:=nullif(p->>'site_id','')::uuid;q text:=coalesce(p->>'q','');sites jsonb;rooms jsonb;total integer;begin
 actor:=public.erp_actor(p_token);if actor.role not in ('admin qc','administrator inbionusa') then raise insufficient_privilege;end if;
 if p_action in ('save_warehouse','save_warehouse_location') then return public.erp_work_mutate(p_token,p_action,p);end if;
 if p_action<>'list' or page not between 1 and 100000 or length(q)>100 then raise check_violation;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'address',w.address,'active',w.active,'version',w.version,'room_count',(select count(*) from public.erp_locations where warehouse_id=w.id)) order by w.name),'[]') into sites from public.erp_warehouses w;
 select count(*) into total from public.erp_locations l where (site is null or l.warehouse_id=site) and (q='' or strpos(lower(l.name),lower(q))>0);
 select coalesce(jsonb_agg(to_jsonb(r) order by r.name),'[]') into rooms from (select l.id,l.name,l.room_name,l.room_kind,l.warehouse_id,l.warehouse,l.active,w.active site_active,l.version from public.erp_locations l join public.erp_warehouses w on w.id=l.warehouse_id where (site is null or l.warehouse_id=site) and (q='' or strpos(lower(l.name),lower(q))>0) order by l.name,l.id limit 20 offset (page-1)*20) r;
 return jsonb_build_object('sites',sites,'rooms',rooms,'total',total,'page',page);
end $$;
revoke all on function public.erp_places_admin(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.erp_places_admin(text,text,jsonb) to service_role;
-- Locations without equipment also appear as work areas in cleaning forms.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.erp_form_public(uuid)'::regprocedure);
 if position('areas jsonb' in definition)=0 then
  definition:=replace(definition,'equipment jsonb;staff jsonb;','equipment jsonb;staff jsonb;areas jsonb;');
  definition:=replace(definition,'if f.published->>''kind''=''equipment_cleaning'' then'||chr(10)||'  select', 'if f.published->>''kind''=''equipment_cleaning'' then'||chr(10)||' select coalesce(jsonb_agg(jsonb_build_object(''id'',l.id,''name'',l.name,''kind'',l.room_kind) order by l.name),''[]'') into areas from public.erp_locations l join public.erp_warehouses w on w.id=l.warehouse_id where l.active and w.active and public.work_location_allowed(f.owner_id,l.id);'||chr(10)||'  select');
  definition:=replace(definition,'join public.erp_locations l on l.id=e.location_id where e.state','join public.erp_locations l on l.id=e.location_id join public.erp_warehouses w on w.id=l.warehouse_id where l.active and w.active and e.state');
  definition:=replace(definition,'''staff'',coalesce(staff,''[]''))','''staff'',coalesce(staff,''[]''),''areas'',coalesce(areas,''[]''))');
  execute definition;
 end if;
 definition:=pg_get_functiondef('public.erp_import_equipment_cleaning(uuid,jsonb,boolean,text)'::regprocedure);
 if position('lower(btrim(l.room_name))' in definition)=0 then definition:=replace(definition,'lower(btrim(l.name))=lower(btrim(f->>''Area Kerja''))','(lower(btrim(l.name))=lower(btrim(f->>''Area Kerja'')) or lower(btrim(l.room_name))=lower(btrim(f->>''Area Kerja'')))');end if;
 execute definition;
end $$;
-- Strip legacy place codes from labels; product, lot, document and equipment codes remain unchanged.
do $$declare r record;definition text;updated text;begin
 for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and prokind='f' and prosrc like '%erp_locations%' loop
  definition:=pg_get_functiondef(r.signature);updated:=definition;
  updated:=replace(updated,'w.code||'' / ''||l.code||'' · ''||l.name','l.name');
  updated:=replace(updated,'w.code||'' · ''||w.name','w.name');
  updated:=replace(updated,'l.code||'' · ''||l.name||'' · ''||w.name','l.name');
  updated:=replace(updated,'l.code||'' · ''||l.name','l.name');
  updated:=replace(updated,'lo.code||'' · ''||lo.name','lo.name');
  updated:=replace(updated,'l.name||'' · ''||w.name','l.name');
  updated:=replace(updated,'f.code||'' → ''||dest.code','f.name||'' → ''||dest.name');
  updated:=replace(updated,'||'' · ''||lo.code','||'' · ''||lo.name');
  if updated<>definition then execute updated;end if;
 end loop;
end $$;
-- Sites and rooms are shared master data, not exclusive to the Warehouse module.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.erp_form_reference_rows(uuid,text,text,integer,uuid)'::regprocedure);
 definition:=replace(definition,'when ''warehouses'' then scope:=''warehouse'';','when ''warehouses'' then scope:=null;');
 definition:=replace(definition,'when ''locations'' then scope:=''warehouse'';','when ''locations'' then scope:=null;');execute definition;
 definition:=pg_get_functiondef('public.work_read_guard(uuid,text)'::regprocedure);
 if position('shared place lookup' in definition)=0 then
  definition:=replace(definition,'begin','begin -- shared place lookup'||chr(10)||' if p_entity in (''locations'',''warehouses'') and exists(select from public.erp_modules where state<>''disabled'' and public.erp_can(p_user,key,''read'')) then return;end if;'||chr(10));execute definition;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
