begin;
set local lock_timeout='15s';
select pg_advisory_xact_lock(49281041);
alter table public.erp_equipment_cleaning add column if not exists form_data jsonb;
create table if not exists public.erp_equipment_imports(source_id text not null,event_id uuid not null,payload_hash text not null,cleaning_id uuid not null references public.erp_equipment_cleaning(id),imported_by uuid not null references public.users(id),created_at timestamptz not null default now(),primary key(source_id,event_id));
alter table public.erp_equipment_imports enable row level security;
revoke all on public.erp_equipment_imports from public,anon,authenticated,service_role;
create or replace function public.erp_import_equipment_cleaning(p_actor uuid,p_payload jsonb,p_pass boolean,p_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare f jsonb:=p_payload->'fields';e public.erp_equipment;prior public.erp_equipment_imports;cleaner uuid;inspector uuid;n integer;started timestamptz:=(p_payload->>'started_at')::timestamptz;finished timestamptz:=(p_payload->>'finished_at')::timestamptz;last_use public.erp_equipment_uses;result uuid;begin
 perform pg_advisory_xact_lock(49281041);
 if not exists(select from public.users where id=p_actor and is_active and not must_change_password) then raise insufficient_privilege;end if;
 perform public.erp_assert(p_actor,'production','write');
 if length(p_payload::text)>65536 or p_pass is null or length(p_hash)<>64 then raise check_violation;end if;
 select * into prior from public.erp_equipment_imports where source_id=p_payload->>'source_id' and event_id=(p_payload->>'event_id')::uuid;
 if found then
  if prior.payload_hash<>p_hash then raise exception 'This form event already exists with different contents. Review the correction manually.';end if;
  return jsonb_build_object('id',prior.cleaning_id,'duplicate',true);
 end if;
 select count(*),(array_agg(a.id))[1] into n,result from public.erp_equipment a join public.erp_locations l on l.id=a.location_id where lower(btrim(a.name))=lower(btrim(f->>'Nama Alat')) and lower(btrim(l.name))=lower(btrim(f->>'Area Kerja'));
 if n<>1 then raise exception 'Equipment and work area must match exactly one registered asset and location.';end if;
 select * into e from public.erp_equipment where id=result for update;
 perform public.work_assert_location(p_actor,e.location_id,'write');
 if e.state in ('in_use','inactive') then raise exception 'Equipment is in use or inactive. Finish its usage before importing cleaning.';end if;
 select count(*),(array_agg(id))[1] into n,cleaner from public.users where is_active and not must_change_password and public.erp_can(id,'production','write') and lower(btrim(nama_lengkap))=lower(btrim(f->>'Nama Petugas'));
 if n<>1 then raise exception 'Cleaning operator must match exactly one active Production user.';end if;
 select count(*),(array_agg(id))[1] into n,inspector from public.users where is_active and not must_change_password and public.erp_can(id,'production','write') and lower(btrim(nama_lengkap))=lower(btrim(f->>'Nama Pemeriksa/Penanggung Jawab Verifikasi'));
 if n<>1 then raise exception 'Inspector must match exactly one active Production user.';end if;
 perform public.work_assert_location(cleaner,e.location_id,'write');perform public.work_assert_location(inspector,e.location_id,'write');
 if started>finished or finished>now()+interval '5 minutes' or nullif(btrim(f->>'Metode Pencucian (Sesuai SOP)'),'') is null or nullif(btrim(f->>'Kondisi Alat Setelah Pencucian'),'') is null then raise exception 'Review cleaning times, method and equipment condition.';end if;
 select * into last_use from public.erp_equipment_uses where equipment_id=e.id order by started_at desc,id desc limit 1;
 if last_use.id is not null and (last_use.finished_at is null or started<last_use.finished_at) then raise exception 'Cleaning predates the latest equipment use. Review it manually.';end if;
 if last_use.id is not null then
  if nullif(btrim(f->>'Nomor Batch'),'') is null then raise exception 'Batch number is required for previously used equipment.';end if;
  if not exists(select from public.erp_movements m where m.id=last_use.movement_id and (m.number=btrim(f->>'Nomor Batch') or exists(select from jsonb_array_elements(m.lines) x join public.erp_lots l on l.id=(x->>'lot_id')::uuid where l.number=btrim(f->>'Nomor Batch'))))
   and not exists(select from public.erp_manufacturing_orders m where m.id=last_use.manufacturing_order_id and (m.number=btrim(f->>'Nomor Batch') or exists(select from public.erp_manufacturing_outputs o join public.erp_lots l on l.id=o.lot_id where o.manufacturing_order_id=m.id and l.number=btrim(f->>'Nomor Batch')))) then raise exception 'Batch number does not match the latest recorded equipment use.';end if;
 elsif nullif(btrim(f->>'Nomor Batch'),'') is not null then raise exception 'Register equipment usage for this batch before importing its cleaning.';
 end if;
 if exists(select from public.erp_equipment_cleaning where equipment_id=e.id and finished_at>=finished) or (e.cleaning_started_at is not null and started<e.cleaning_started_at) then raise exception 'A newer cleaning record or activity already exists. Review this older form manually.';end if;
 insert into public.erp_equipment_cleaning(equipment_id,cleaned_by,inspected_by,method,agent,condition,result,reason,started_at,finished_at,usage_id,form_data)
 values(e.id,cleaner,inspector,f->>'Metode Pencucian (Sesuai SOP)',coalesce(f->>'Bahan Pembersih Yang Digunakan',''),f->>'Kondisi Alat Setelah Pencucian',case when p_pass then 'pass' else 'fail' end,'Google Form verification',started,finished,last_use.id,f) returning id into result;
 insert into public.erp_equipment_imports values(p_payload->>'source_id',(p_payload->>'event_id')::uuid,p_hash,result,p_actor,now());
 update public.erp_equipment set state=case when p_pass then 'ready' else 'repair' end,version=version+1,cleaning_started_at=null where id=e.id;
 perform public.work_event('equipment',e.id,'import_cleaning_form',p_actor,'Google Form verification',jsonb_build_object('state',e.state),jsonb_build_object('state',case when p_pass then 'ready' else 'repair' end,'cleaning_id',result,'event_id',p_payload->>'event_id'));
 return jsonb_build_object('id',result,'duplicate',false,'result',case when p_pass then 'pass' else 'fail' end);
end $$;
revoke all on function public.erp_import_equipment_cleaning(uuid,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.erp_import_equipment_cleaning(uuid,jsonb,boolean,text) to service_role;
notify pgrst,'reload schema';
commit;
