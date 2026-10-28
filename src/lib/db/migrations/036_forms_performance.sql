begin;
set local lock_timeout='15s';
-- Private authorization path: do not rebuild equipment/batch/staff choices for every guard.
create or replace function public.erp_form_guard(p_link uuid) returns public.erp_forms language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare f public.erp_forms;begin
 select * into f from public.erp_forms where public_token=p_link and active and deleted_at is null and published is not null;
 if not found then raise no_data_found;end if;
 if not exists(select from public.users where id=f.owner_id and is_active and not must_change_password and role in ('admin qc','administrator inbionusa')) then raise insufficient_privilege;end if;
 if f.published->>'kind'='equipment_cleaning' then perform public.erp_assert(f.owner_id,'production','write');end if;
 return f;
end $$;
revoke all on function public.erp_form_guard(uuid) from public,anon,authenticated,service_role;
create index if not exists forms_equipment_latest_use on public.erp_equipment_uses(equipment_id,started_at desc,id desc);
create index if not exists forms_equipment_latest_cleaning on public.erp_equipment_cleaning(equipment_id,finished_at desc);
create index if not exists forms_submission_history on public.erp_form_submissions(form_id,created_at desc);
-- Replace only the repeated guard; retain replay, revision, reference and cleaning checks.
do $$declare definition text;signature text;begin
 foreach signature in array array['public.erp_form_public_receipt(uuid,uuid,text)','public.erp_form_submit(uuid,integer,uuid,text,jsonb,jsonb,jsonb,boolean)','public.erp_form_references(uuid,text,text,integer)'] loop
 definition:=pg_get_functiondef(signature::regprocedure);
 definition:=replace(definition,'perform public.erp_form_public(p_link);','perform public.erp_form_guard(p_link);');
 execute definition;
 end loop;
 definition:=pg_get_functiondef('public.erp_forms_admin(text,text,uuid,jsonb,integer)'::regprocedure);
 definition:=replace(definition,'jsonb_agg(to_jsonb(x) order by x.created_at desc)','jsonb_agg(jsonb_build_object(''id'',x.id,''draft'',jsonb_build_object(''title'',x.draft->>''title''),''published_revision'',x.published_revision,''version'',x.version,''active'',x.active,''public_token'',x.public_token,''created_at'',x.created_at) order by x.created_at desc)');
 execute definition;
end $$;
-- Combine validation data and the initial replay check in one server round trip.
create or replace function public.erp_form_prepare(p_link uuid,p_request uuid,p_hash text) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare receipt jsonb;begin
 receipt:=public.erp_form_public_receipt(p_link,p_request,p_hash);
 if receipt is not null then return jsonb_build_object('receipt',receipt);end if;
 return jsonb_build_object('form',public.erp_form_public(p_link));
end $$;
revoke all on function public.erp_form_prepare(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.erp_form_prepare(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
