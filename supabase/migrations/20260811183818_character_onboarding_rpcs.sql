create or replace function public.create_character(p_display_name text)
returns public.characters
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_character public.characters%rowtype;
  v_name text := btrim(p_display_name);
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if char_length(v_name) < 3 or char_length(v_name) > 24 then
    raise exception 'Character name must be between 3 and 24 characters';
  end if;

  if v_name !~ '^[A-Za-z0-9 _''-]+$' then
    raise exception 'Character name contains unsupported characters';
  end if;

  if exists (select 1 from public.characters where user_id = v_uid) then
    raise exception 'This account already has a character';
  end if;

  insert into public.profiles(id, display_name)
  values(v_uid, v_name);

  insert into public.characters(user_id)
  values(v_uid)
  returning * into v_character;

  return v_character;
end;
$$;

revoke all on function public.create_character(text) from public, anon;
grant execute on function public.create_character(text) to authenticated;

create or replace function public.configure_combat_loadout(
  p_primary text,
  p_secondary text,
  p_supplementals text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
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
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select id, combat_loadout_locked_at
  into v_character_id, v_locked_at
  from public.characters
  where user_id = v_uid
  for update;

  if v_character_id is null then
    raise exception 'Character not found';
  end if;

  if v_locked_at is not null then
    raise exception 'Combat loadout is already locked';
  end if;

  if p_primary is null or btrim(p_primary) = '' then
    raise exception 'A primary combat skill is required';
  end if;

  v_expected_supp_count := case when p_secondary is null then 5 else 4 end;
  if v_supp_count <> v_expected_supp_count then
    raise exception 'Expected % supplemental skills, received %', v_expected_supp_count, v_supp_count;
  end if;

  select count(distinct skill_key)
  into v_unique_count
  from (
    select p_primary as skill_key
    union all
    select p_secondary where p_secondary is not null
    union all
    select unnest(p_supplementals)
  ) s;

  if v_unique_count <> 6 then
    raise exception 'All six combat skill selections must be unique';
  end if;

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

  if v_bad is not null then
    raise exception 'Invalid supplemental combat skill: %', v_bad;
  end if;

  delete from public.character_combat_skills
  where character_id=v_character_id;

  insert into public.character_combat_skills(character_id, skill_key, slot_role)
  values(v_character_id, p_primary, 'primary');

  if p_secondary is not null then
    insert into public.character_combat_skills(character_id, skill_key, slot_role)
    values(v_character_id, p_secondary, 'secondary');
  end if;

  insert into public.character_combat_skills(character_id, skill_key, slot_role)
  select v_character_id, skill_key, 'supplemental'
  from unnest(p_supplementals) as t(skill_key);

  return jsonb_build_object(
    'character_id', v_character_id,
    'primary', p_primary,
    'secondary', p_secondary,
    'supplementals', to_jsonb(p_supplementals),
    'total', 6
  );
end;
$$;

revoke all on function public.configure_combat_loadout(text,text,text[]) from public, anon;
grant execute on function public.configure_combat_loadout(text,text,text[]) to authenticated;

create or replace function public.get_onboarding_state()
returns jsonb
language plpgsql
security invoker
stable
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile jsonb;
  v_character jsonb;
  v_loadout jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select to_jsonb(p) into v_profile
  from public.profiles p where p.id=v_uid;

  select to_jsonb(c) into v_character
  from public.characters c where c.user_id=v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'skill_key', ccs.skill_key,
    'slot_role', ccs.slot_role,
    'skill_level', ccs.skill_level,
    'skill_xp', ccs.skill_xp
  ) order by case ccs.slot_role when 'primary' then 1 when 'secondary' then 2 else 3 end, ccs.skill_key), '[]'::jsonb)
  into v_loadout
  from public.character_combat_skills ccs
  join public.characters c on c.id=ccs.character_id
  where c.user_id=v_uid;

  return jsonb_build_object(
    'profile', v_profile,
    'character', v_character,
    'loadout', v_loadout
  );
end;
$$;

revoke all on function public.get_onboarding_state() from public, anon;
grant execute on function public.get_onboarding_state() to authenticated;
