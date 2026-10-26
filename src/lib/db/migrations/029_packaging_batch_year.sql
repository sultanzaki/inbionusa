begin;
set local lock_timeout='15s';
set local statement_timeout='120s';
select pg_advisory_xact_lock(49281041);

-- Reuse saved product packaging across every page and filter in the product list.
create or replace function public.erp_packaging_options(p_token text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare u public.users;result jsonb;
begin
 u:=public.erp_actor(p_token);
 if not (public.erp_qc_can(u.id,'create_produk') or public.erp_qc_can(u.id,'update_produk')) then raise insufficient_privilege;end if;
 select coalesce(jsonb_agg(packaging order by packaging),'[]') into result from
 (select distinct btrim(tipe_kemasan) packaging from public.master_produk where btrim(tipe_kemasan)<>'') p;
 return result;
end $$;
revoke all on function public.erp_packaging_options(text) from public,anon,authenticated;
grant execute on function public.erp_packaging_options(text) to service_role;

-- Modify only the final expiry-year segment. Existing posted identities stay immutable.
do $$declare definition text;old_format text;new_format text;begin
 old_format:=$old$extract(year from (l.mfg_date+interval '1 year'))::integer$old$;
 new_format:=$new$to_char(l.mfg_date+interval '1 year','YY')$new$;
 definition:=pg_get_functiondef('public.erp_mutate_v5(text,text,jsonb)'::regprocedure);
 if position(old_format in definition)>0 then
  execute replace(definition,old_format,new_format);
 elsif position(new_format in definition)=0 then raise exception 'Unexpected production batch implementation';end if;
 definition:=pg_get_functiondef('public.erp_batch_preview(text,uuid,date)'::regprocedure);
 old_format:=$old$to_char(p_date+interval '1 year','YYYY')$old$;
 new_format:=$new$to_char(p_date+interval '1 year','YY')$new$;
 if position(old_format in definition)>0 then
  execute replace(definition,old_format,new_format);
 elsif position(new_format in definition)=0 then raise exception 'Unexpected batch preview implementation';end if;
end $$;

-- Adopt both historical four-digit and new two-digit suffixes without reusing a batch.
create or replace function public.erp_seed_batch_counter(p_product uuid,p_series text) returns void
language sql set search_path=pg_catalog,public as $$
 insert into public.erp_batch_counters(product_id,year,batch)
 select p_product,extract(year from d)::integer,max(parts[1]::integer) from (
  select parts,public.erp_safe_date(substr(parts[2],5,4)||'-'||substr(parts[2],3,2)||'-'||substr(parts[2],1,2)) d from (
   select regexp_match(number,'^[0-9]+\.([0-9]{1,9})\.([0-9]{8})\.(?:[0-9]{2}|[0-9]{4})$') parts from public.erp_lots where product_id=p_product and split_part(number,'.',1)=p_series
  ) matches where parts is not null
 ) dated where d is not null and parts[1]::integer>0 group by extract(year from d)
 on conflict(product_id,year) do update set batch=greatest(erp_batch_counters.batch,excluded.batch);
$$;
revoke all on function public.erp_seed_batch_counter(uuid,text) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
