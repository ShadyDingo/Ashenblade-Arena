-- Keep privileged game mutations out of the exposed public schema.
-- Public RPCs remain thin SECURITY INVOKER wrappers callable only by authenticated users.

create or replace function private._begin_travel(p_dx integer, p_dy integer)
returns public.travel_jobs
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid := (select auth.uid());
  v_character public.characters%rowtype;
  v_tx int;
  v_ty int;
  v_distance int;
  v_known boolean;
  v_seconds int;
  v_job public.travel_jobs%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if abs(p_dx) + abs(p_dy) <> 1 then raise exception 'Travel must be one grid north, south, east, or west'; end if;

  select * into v_character from public.characters where user_id=v_uid for update;
  if not found then raise exception 'Character not found'; end if;
  if v_character.combat_loadout_locked_at is null then raise exception 'Choose and lock exactly 6 combat skills before leaving Cinderwatch'; end if;
  if exists(select 1 from public.travel_jobs where character_id=v_character.id and status='traveling') then raise exception 'Character is already traveling'; end if;

  perform private.accrue_rested_time(v_character.id);

  v_tx := v_character.current_x + p_dx;
  v_ty := v_character.current_y + p_dy;
  v_distance := abs(v_tx) + abs(v_ty);
  v_known := exists(select 1 from public.world_cells where x=v_tx and y=v_ty);
  v_seconds := private.exploration_seconds(v_distance, v_known);

  insert into public.travel_jobs(character_id,from_x,from_y,to_x,to_y,completes_at)
  values(v_character.id,v_character.current_x,v_character.current_y,v_tx,v_ty,now()+make_interval(secs=>v_seconds))
  returning * into v_job;
  return v_job;
end;
$$;

create or replace function private._cancel_travel()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid := (select auth.uid());
  v_character_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select id into v_character_id from public.characters where user_id=v_uid;
  update public.travel_jobs set status='cancelled', cancelled_at=now()
  where character_id=v_character_id and status='traveling';
end;
$$;

create or replace function private._configure_combat_loadout(p_primary text, p_secondary text, p_supplementals text[])
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid := (select auth.uid());
  v_character_id uuid;
  v_locked_at timestamptz;
  v_supp_count int := coalesce(array_length(p_supplementals, 1), 0);
  v_expected_supp_count int;
  v_unique_count int;
  v_bad text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select id, combat_loadout_locked_at
  into v_character_id, v_locked_at
  from public.characters
  where user_id = v_uid
  for update;

  if v_character_id is null then raise exception 'Character not found'; end if;
  if v_locked_at is not null then raise exception 'Combat loadout is already locked'; end if;
  if p_primary is null or btrim(p_primary) = '' then raise exception 'A primary combat skill is required'; end if;

  v_expected_supp_count := case when p_secondary is null then 5 else 4 end;
  if v_supp_count <> v_expected_supp_count then
    raise exception 'Expected % supplemental skills, received %', v_expected_supp_count, v_supp_count;
  end if;

  select count(distinct skill_key)
  into v_unique_count
  from (
    select p_primary as skill_key
    union all select p_secondary where p_secondary is not null
    union all select unnest(p_supplementals)
  ) s;
  if v_unique_count <> 6 then raise exception 'All six combat skill selections must be unique'; end if;

  if not exists(select 1 from public.combat_skills where key=p_primary and slot_type='primary') then
    raise exception 'Invalid primary combat skill';
  end if;
  if p_secondary is not null and not exists(select 1 from public.combat_skills where key=p_secondary and slot_type='primary') then
    raise exception 'Invalid secondary combat skill';
  end if;

  select x.skill_key into v_bad
  from unnest(p_supplementals) as x(skill_key)
  left join public.combat_skills cs on cs.key=x.skill_key and cs.slot_type='supplemental'
  where cs.key is null
  limit 1;
  if v_bad is not null then raise exception 'Invalid supplemental combat skill: %', v_bad; end if;

  delete from public.character_combat_skills where character_id=v_character_id;
  insert into public.character_combat_skills(character_id, skill_key, slot_role)
  values(v_character_id, p_primary, 'primary');
  if p_secondary is not null then
    insert into public.character_combat_skills(character_id, skill_key, slot_role)
    values(v_character_id, p_secondary, 'secondary');
  end if;
  insert into public.character_combat_skills(character_id, skill_key, slot_role)
  select v_character_id, skill_key, 'supplemental' from unnest(p_supplementals) as t(skill_key);

  return jsonb_build_object('character_id',v_character_id,'primary',p_primary,'secondary',p_secondary,'supplementals',to_jsonb(p_supplementals),'total',6);
end;
$$;

create or replace function private._create_character(p_display_name text)
returns public.characters
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid := (select auth.uid());
  v_character public.characters%rowtype;
  v_name text := btrim(p_display_name);
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if char_length(v_name) < 3 or char_length(v_name) > 24 then raise exception 'Character name must be between 3 and 24 characters'; end if;
  if v_name !~ '^[A-Za-z0-9 _''-]+$' then raise exception 'Character name contains unsupported characters'; end if;
  if exists (select 1 from public.characters where user_id = v_uid) then raise exception 'This account already has a character'; end if;

  insert into public.profiles(id, display_name) values(v_uid, v_name);
  insert into public.characters(user_id) values(v_uid) returning * into v_character;
  return v_character;
end;
$$;

create or replace function private._lock_combat_loadout()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid := (select auth.uid());
  v_character_id uuid;
  v_total int;
  v_primary int;
  v_secondary int;
  v_supplemental int;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select id into v_character_id from public.characters where user_id=v_uid for update;
  if v_character_id is null then raise exception 'Character not found'; end if;

  select count(*), count(*) filter (where slot_role='primary'), count(*) filter (where slot_role='secondary'), count(*) filter (where slot_role='supplemental')
  into v_total,v_primary,v_secondary,v_supplemental
  from public.character_combat_skills where character_id=v_character_id;

  if v_total <> 6 then raise exception 'Exactly 6 combat skills are required'; end if;
  if v_primary <> 1 then raise exception 'Exactly one primary combat skill is required'; end if;
  if v_secondary > 1 then raise exception 'At most one secondary combat skill is allowed'; end if;
  if v_secondary=1 and v_supplemental<>4 then raise exception 'A build with a secondary requires exactly 4 supplemental skills'; end if;
  if v_secondary=0 and v_supplemental<>5 then raise exception 'A build without a secondary requires exactly 5 supplemental skills'; end if;

  update public.characters set combat_loadout_locked_at=coalesce(combat_loadout_locked_at,now()) where id=v_character_id;
end;
$$;

create or replace function private._refresh_character_rest()
returns table(rested_seconds integer, last_rest_accrual_date date)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid := (select auth.uid());
  v_character_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select id into v_character_id from public.characters where user_id = v_uid;
  if v_character_id is null then raise exception 'Character not found'; end if;
  perform private.accrue_rested_time(v_character_id);
  return query select c.rested_seconds, c.last_rest_accrual_date from public.characters c where c.id=v_character_id;
end;
$$;

revoke all on schema private from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private._begin_travel(integer,integer) to authenticated;
grant execute on function private._cancel_travel() to authenticated;
grant execute on function private._configure_combat_loadout(text,text,text[]) to authenticated;
grant execute on function private._create_character(text) to authenticated;
grant execute on function private._lock_combat_loadout() to authenticated;
grant execute on function private._refresh_character_rest() to authenticated;

create or replace function public.begin_travel(p_dx integer, p_dy integer)
returns public.travel_jobs
language sql
security invoker
set search_path = pg_catalog, public, private
as $$ select private._begin_travel(p_dx,p_dy); $$;

create or replace function public.cancel_travel()
returns void
language sql
security invoker
set search_path = pg_catalog, public, private
as $$ select private._cancel_travel(); $$;

create or replace function public.configure_combat_loadout(p_primary text, p_secondary text, p_supplementals text[])
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public, private
as $$ select private._configure_combat_loadout(p_primary,p_secondary,p_supplementals); $$;

create or replace function public.create_character(p_display_name text)
returns public.characters
language sql
security invoker
set search_path = pg_catalog, public, private
as $$ select private._create_character(p_display_name); $$;

create or replace function public.lock_combat_loadout()
returns void
language sql
security invoker
set search_path = pg_catalog, public, private
as $$ select private._lock_combat_loadout(); $$;

create or replace function public.refresh_character_rest()
returns table(rested_seconds integer, last_rest_accrual_date date)
language sql
security invoker
set search_path = pg_catalog, public, private
as $$ select * from private._refresh_character_rest(); $$;

revoke execute on function public.begin_travel(integer,integer) from public, anon;
revoke execute on function public.cancel_travel() from public, anon;
revoke execute on function public.configure_combat_loadout(text,text,text[]) from public, anon;
revoke execute on function public.create_character(text) from public, anon;
revoke execute on function public.lock_combat_loadout() from public, anon;
revoke execute on function public.refresh_character_rest() from public, anon;
grant execute on function public.begin_travel(integer,integer) to authenticated;
grant execute on function public.cancel_travel() to authenticated;
grant execute on function public.configure_combat_loadout(text,text,text[]) to authenticated;
grant execute on function public.create_character(text) to authenticated;
grant execute on function public.lock_combat_loadout() to authenticated;
grant execute on function public.refresh_character_rest() to authenticated;
