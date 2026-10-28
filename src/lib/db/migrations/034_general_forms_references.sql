begin;
set local lock_timeout='15s';
select pg_advisory_xact_lock(49281041);
alter table public.erp_form_submissions add column if not exists reference_data jsonb not null default '{}';
-- Whitelisted identity projections. No arbitrary table/column names accepted.
create or replace function public.erp_form_reference_rows(p_actor uuid,p_source text,p_search text default '',p_offset integer default 0,p_id uuid default null) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare query text;scope text;result jsonb;begin
 if p_offset<0 or p_offset>100000 or length(p_search)>150 then raise check_violation;end if;
 case p_source
 when 'products' then scope:=null;query:=$q$select p.id, p.kode_produk||' · '||p.nama_produk label from public.master_produk p$q$;
 when 'units' then scope:=null;query:=$q$select id,code||' · '||name label from public.erp_units$q$;
 when 'staff' then scope:=null;query:=$q$select id,nama_lengkap||' · '||username label from public.users where is_active and not must_change_password$q$;
 when 'equipment' then scope:='production';query:=$q$select e.id,e.code||' · '||e.name||' · '||l.name label from public.erp_equipment e join public.erp_locations l on l.id=e.location_id where e.state<>'inactive' and public.work_location_allowed(p_actor,l.id)$q$;
 when 'manufacturing_orders' then scope:='production';query:=$q$select m.id,m.number||' · '||p.nama_produk label from public.erp_manufacturing_orders m join public.master_produk p on p.id=m.product_id where public.work_location_allowed(p_actor,m.location_id)$q$;
 when 'production_records' then scope:='production';query:=$q$select m.id,m.number||' · '||m.date::text label from public.erp_movements m where m.kind='production' and (m.to_location is null or public.work_location_allowed(p_actor,m.to_location)) and (m.from_location is null or public.work_location_allowed(p_actor,m.from_location))$q$;
 when 'cleaning' then scope:='production';query:=$q$select c.id,e.code||' · '||e.name||' · '||(c.finished_at at time zone 'Asia/Jakarta')::date::text label from public.erp_equipment_cleaning c join public.erp_equipment e on e.id=c.equipment_id where public.work_location_allowed(p_actor,e.location_id)$q$;
 when 'lots' then scope:='warehouse';query:=$q$select l.id,p.nama_produk||' · '||l.number label from public.erp_lots l join public.master_produk p on p.id=l.product_id where not exists(select from public.erp_warehouse_scopes s where s.user_id=p_actor and s.restricted) or exists(select from public.erp_balances b where b.lot_id=l.id and public.work_location_allowed(p_actor,b.location_id))$q$;
 when 'warehouses' then scope:='warehouse';query:=$q$select w.id,w.code||' · '||w.name label from public.erp_warehouses w where w.active and (not exists(select from public.erp_warehouse_scopes s where s.user_id=p_actor and s.restricted) or exists(select from public.erp_locations l where l.warehouse_id=w.id and public.work_location_allowed(p_actor,l.id)))$q$;
 when 'locations' then scope:='warehouse';query:=$q$select l.id,l.code||' · '||l.name||' · '||w.name label from public.erp_locations l join public.erp_warehouses w on w.id=l.warehouse_id where l.active and w.active and public.work_location_allowed(p_actor,l.id)$q$;
 when 'pallets' then scope:='warehouse';query:=$q$select p.id,p.number||coalesce(' · '||l.name,'') label from public.erp_pallets p left join public.erp_locations l on l.id=p.location_id where p.location_id is not null and public.work_location_allowed(p_actor,p.location_id)$q$;
 when 'movements' then scope:='warehouse';query:=$q$select m.id,m.number||' · '||m.kind||' · '||m.date::text label from public.erp_movements m where (m.to_location is null or public.work_location_allowed(p_actor,m.to_location)) and (m.from_location is null or public.work_location_allowed(p_actor,m.from_location))$q$;
 when 'counts' then scope:='warehouse';query:=$q$select c.id,c.number||' · '||l.name label from public.erp_counts c join public.erp_locations l on l.id=c.location_id where public.work_location_allowed(p_actor,l.id)$q$;
 when 'transfers' then scope:='warehouse';query:=$q$select id,number||' · '||date::text label from public.erp_warehouse_transfers where public.work_location_allowed(p_actor,from_location) and public.work_location_allowed(p_actor,to_location)$q$;
 when 'returns' then scope:='warehouse';query:=$q$select id,number label from (select r.id,'Retur · '||l.number||' · '||r.state number from public.erp_returns r join public.erp_lots l on l.id=r.source_lot_id where public.work_location_allowed(p_actor,r.location_id)) x$q$;
 when 'materials' then scope:='purchase';query:=$q$select id,code||' · '||name label from public.erp_materials where active$q$;
 when 'material_lots' then scope:='purchase';query:=$q$select l.id,m.name||' · '||l.number label from public.erp_material_lots l join public.erp_materials m on m.id=l.material_id where not exists(select from public.erp_warehouse_scopes s where s.user_id=p_actor and s.restricted) or exists(select from public.erp_material_balances b where b.lot_id=l.id and public.work_location_allowed(p_actor,b.location_id))$q$;
 when 'suppliers' then scope:='purchase';query:=$q$select id,name label from public.erp_suppliers where active$q$;
 when 'purchase_orders' then scope:='purchase';query:=$q$select p.id,p.number||' · '||s.name label from public.erp_purchase_orders p join public.erp_suppliers s on s.id=p.supplier_id$q$;
 when 'customers' then scope:='sales';query:=$q$select id,name label from public.erp_customers$q$;
 when 'quotes' then scope:='sales';query:=$q$select q.id,q.number||' · '||c.name label from public.erp_quotes q join public.erp_customers c on c.id=q.customer_id$q$;
 when 'orders' then scope:='sales';query:=$q$select o.id,o.number||' · '||c.name label from public.erp_orders o join public.erp_quotes q on q.id=o.quote_id join public.erp_customers c on c.id=q.customer_id$q$;
 when 'opportunities' then scope:='crm';query:=$q$select id,title label from public.erp_opportunities$q$;
 when 'activities' then scope:='crm';query:=$q$select id,title||' · '||due_date::text label from public.erp_crm_activities$q$;
 when 'samples' then scope:='crm';query:=$q$select s.id,s.number||' · '||c.name label from public.erp_sample_requests s join public.erp_customers c on c.id=s.customer_id where s.location_id is null or public.work_location_allowed(p_actor,s.location_id)$q$;
 when 'inspections' then scope:='quality';query:=$q$select i.id,p.nama_produk||' · '||i.no_lot||' · '||i.status label from public.hasil_uji i join public.master_produk p on p.id=i.id_produk$q$;
 when 'incoming_inspections' then scope:='quality';query:=$q$select i.id,i.number||' · '||m.name||' · '||l.number label from public.erp_incoming_inspections i join public.erp_material_lots l on l.id=i.lot_id join public.erp_materials m on m.id=l.material_id$q$;
 when 'certificates' then scope:='quality';query:=$q$select c.id,c.no_coa||' · '||p.nama_produk||' · '||c.no_lot label from public.coa c join public.master_produk p on p.id=c.id_produk$q$;
 when 'material_specs' then scope:='quality';query:=$q$select s.id,m.name||' · '||s.title||' · v'||s.revision::text label from public.erp_material_specs s join public.erp_materials m on m.id=s.material_id$q$;
 when 'product_documents' then scope:='documents';query:=$q$select d.id,d.number||' · '||d.title||' · '||p.nama_produk label from public.erp_product_documents d join public.master_produk p on p.id=d.product_id$q$;
 when 'controlled_documents' then scope:='documents';query:=$q$select id,number||' · '||title label from public.erp_controlled_documents$q$;
 when 'cases' then scope:='service';query:=$q$select id,number||' · '||kind label from public.erp_cases$q$;
 when 'billing' then scope:='finance';query:=$q$select id,number||' · '||kind label from public.erp_fin_documents$q$;
 when 'payments' then scope:='finance';query:=$q$select id,number||' · '||direction||' · '||date::text label from public.erp_fin_payments$q$;
 else raise insufficient_privilege;end case;
 if scope is not null then perform public.erp_assert(p_actor,scope,'read');end if;
 -- p_actor is substituted as a bound parameter, never interpolated text.
 query:=replace(query,'p_actor','$1');
 execute 'select coalesce(jsonb_agg(to_jsonb(x) order by x.label,x.id),''[]'') from (select id,label from ('||query||') r where ($2::uuid is null or id=$2) and ($3='''' or strpos(lower(label),lower($3))>0) order by label,id limit 26 offset $4)x'
 into result using p_actor,p_id,p_search,p_offset;
 return jsonb_build_object('items',case when jsonb_array_length(result)>25 then result-25 else result end,'has_more',jsonb_array_length(result)>25);
end $$;
revoke all on function public.erp_form_reference_rows(uuid,text,text,integer,uuid) from public,anon,authenticated,service_role;
-- Administration forms are independent of Production. Cleaning retains its operational gate.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.erp_forms_admin(text,text,uuid,jsonb,integer)'::regprocedure);
 if position('if f.draft->>' in definition)=0 then definition:=replace(definition,'perform public.erp_assert(actor.id,''production'',''write'');','if f.draft->>''kind''=''equipment_cleaning'' then perform public.erp_assert(actor.id,''production'',''write'');end if;');end if;
 execute definition;
 definition:=pg_get_functiondef('public.erp_form_public(uuid)'::regprocedure);
 if position('and role in (' in definition)=0 then definition:=replace(definition,'where id=f.owner_id and is_active and not must_change_password','where id=f.owner_id and is_active and not must_change_password and role in (''admin qc'',''administrator inbionusa'')');end if;
 if position('if f.published->>''kind''=''equipment_cleaning'' then perform public.erp_assert' in definition)=0 then definition:=replace(definition,'perform public.erp_assert(f.owner_id,''production'',''write'');','if f.published->>''kind''=''equipment_cleaning'' then perform public.erp_assert(f.owner_id,''production'',''write'');end if;');end if;
 execute definition;
end $$;
-- Public callers may query only sources explicitly selected in the published form.
create or replace function public.erp_form_references(p_link uuid,p_field text,p_search text default '',p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare f public.erp_forms;field jsonb;begin
 perform public.erp_form_public(p_link);
 select * into f from public.erp_forms where public_token=p_link;
 select x into field from jsonb_array_elements(f.published->'fields') x where x->>'id'=p_field and x->>'type'='reference';
 if field is null then raise insufficient_privilege;end if;
 return public.erp_form_reference_rows(f.owner_id,field->>'source',p_search,p_offset);
end $$;
-- Validate references again inside the atomic submission and preserve identity + label snapshots.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.erp_form_submit(uuid,integer,uuid,text,jsonb,jsonb,jsonb,boolean)'::regprocedure);
 if position('refs jsonb' in definition)=0 then
 definition:=replace(definition,'result uuid;','result uuid;refs jsonb:=''{}'';field jsonb;choice jsonb;selected_value text;');
 definition:=replace(definition,'insert into public.erp_form_submissions(', $patch$
 for field in select x from jsonb_array_elements(f.published->'fields') x where x->>'type'='reference' loop
  selected_value:=nullif(btrim(p_answers->>(field->>'id')),'');
  if selected_value is null then
   if (field->>'required')::boolean then raise exception using message='Choose a reference for '||(field->>'label'),detail=field->>'id';end if;
   continue;
  end if;
  if selected_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise check_violation;end if;
  choice:=public.erp_form_reference_rows(f.owner_id,field->>'source','',0,selected_value::uuid)->'items'->0;
  if choice is null then raise exception using message='This reference is no longer available: '||(field->>'label'),detail=field->>'id';end if;
  refs:=refs||jsonb_build_object(field->>'id',choice||jsonb_build_object('source',field->>'source'));
  p_answers:=jsonb_set(p_answers,array[field->>'id'],choice->'label');
 end loop;
 insert into public.erp_form_submissions($patch$);
 definition:=replace(definition,'answers,files,cleaning_id)','answers,files,cleaning_id,reference_data)');
 definition:=replace(definition,$old$nullif(cleaning->>'id','')::uuid)$old$,$new$nullif(cleaning->>'id','')::uuid,refs)$new$);
 execute definition;
 end if;
end $$;
revoke all on function public.erp_form_references(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.erp_form_references(uuid,text,text,integer) to service_role;
notify pgrst,'reload schema';
commit;
