begin;
set local lock_timeout='15s';
alter table public.erp_forms add column if not exists deleted_at timestamptz;
-- Retain response attachments and linked operational evidence when removing a form.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.erp_forms_admin(text,text,uuid,jsonb,integer)'::regprocedure);
 if position('p_action=''delete''' in definition)=0 then
  if position('select * into f from public.erp_forms where id=p_id for update;' in definition)=0 then raise exception 'Unexpected Forms administration implementation';end if;
  definition:=replace(definition,'if p_action=''list'' then','if p_action=''delete'' then perform pg_advisory_xact_lock(49281041);end if; if p_action=''list'' then');
  definition:=replace(definition,'from public.erp_forms x)','from public.erp_forms x where x.deleted_at is null)');
  definition:=replace(definition,'where id=p_id for update;','where id=p_id and deleted_at is null for update;');
  definition:=replace(definition,'elsif p_action=''pause'' then', 'elsif p_action=''delete'' then update public.erp_forms set active=false,deleted_at=now(),version=version+1 where id=f.id; elsif p_action=''pause'' then');
  execute definition;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
