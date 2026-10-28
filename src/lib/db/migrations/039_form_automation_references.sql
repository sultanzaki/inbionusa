begin;
set local lock_timeout='15s';
select pg_advisory_xact_lock(49281041);
-- One field-reference path for both form kinds; operational mappings narrow eligible identities.
create or replace function public.erp_form_field_reference_rows(p_actor uuid,p_template jsonb,p_field text,p_search text default '',p_offset integer default 0,p_id uuid default null) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare field jsonb;result jsonb;begin
 if p_offset<0 or p_offset>100000 or length(p_search)>150 then raise check_violation;end if;
 select x into field from jsonb_array_elements(p_template->'fields') x where x->>'id'=p_field and x->>'type'='reference';
 if field is null then raise insufficient_privilege;end if;
 if p_template->>'kind'='equipment_cleaning' and field->>'source'='staff' and field->>'binding' in ('Nama Petugas','Nama Pemeriksa/Penanggung Jawab Verifikasi') then
  perform public.erp_assert(p_actor,'production','write');
  select coalesce(jsonb_agg(to_jsonb(r) order by r.label,r.id),'[]') into result from (
   select u.id,u.nama_lengkap||' · '||u.username label from public.users u where u.is_active and not u.must_change_password and public.erp_can(u.id,'production','write') and (p_id is null or u.id=p_id) and (p_search='' or strpos(lower(u.nama_lengkap||' · '||u.username),lower(p_search))>0) order by label,u.id limit 26 offset p_offset
  )r;
 elsif p_template->>'kind'='equipment_cleaning' and field->>'source'='equipment' and field->>'binding'='Nama Alat' then
  perform public.erp_assert(p_actor,'production','write');
  select coalesce(jsonb_agg(to_jsonb(r) order by r.label,r.id),'[]') into result from (
   select e.id,e.code||' · '||e.name||' · '||l.name label from public.erp_equipment e join public.erp_locations l on l.id=e.location_id join public.erp_warehouses w on w.id=l.warehouse_id where e.state not in ('in_use','inactive') and l.active and w.active and public.work_location_allowed(p_actor,l.id) and (p_id is null or e.id=p_id) and (p_search='' or strpos(lower(e.code||' · '||e.name||' · '||l.name),lower(p_search))>0) order by label,e.id limit 26 offset p_offset
  )r;
 else return public.erp_form_reference_rows(p_actor,field->>'source',p_search,p_offset,p_id);
 end if;
 return jsonb_build_object('items',case when jsonb_array_length(result)>25 then result-25 else result end,'has_more',jsonb_array_length(result)>25);
end $$;
revoke all on function public.erp_form_field_reference_rows(uuid,jsonb,text,text,integer,uuid) from public,anon,authenticated,service_role;
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.erp_form_references(uuid,text,text,integer)'::regprocedure);
 if position('erp_form_field_reference_rows' in definition)=0 then
  if position('return public.erp_form_reference_rows(f.owner_id,field->>''source'',p_search,p_offset);' in definition)=0 then raise exception 'Unexpected form reference implementation';end if;
  definition:=replace(definition,'return public.erp_form_reference_rows(f.owner_id,field->>''source'',p_search,p_offset);','return public.erp_form_field_reference_rows(f.owner_id,f.published,p_field,p_search,p_offset);');execute definition;
 end if;
 definition:=pg_get_functiondef('public.erp_form_submit(uuid,integer,uuid,text,jsonb,jsonb,jsonb,boolean)'::regprocedure);
 if position('erp_form_field_reference_rows' in definition)=0 then
  if position('choice:=public.erp_form_reference_rows(f.owner_id,field->>''source'','''',0,selected_value::uuid)' in definition)=0 then raise exception 'Unexpected form submission implementation';end if;
  definition:=replace(definition,'choice:=public.erp_form_reference_rows(f.owner_id,field->>''source'','''',0,selected_value::uuid)','choice:=public.erp_form_field_reference_rows(f.owner_id,f.published,field->>''id'','''',0,selected_value::uuid)');execute definition;
 end if;
end $$;
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.erp_import_equipment_cleaning(uuid,jsonb,boolean,text)'::regprocedure);
 definition:=replace(definition,'Google Form verification','Cleaning form verification');execute definition;
end $$;
notify pgrst,'reload schema';
commit;
