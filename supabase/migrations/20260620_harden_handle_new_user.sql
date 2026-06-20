-- Harden handle_new_user so profile creation never violates the
-- profiles.username NOT NULL / UNIQUE constraints.
--
-- Previously username was derived only from raw_user_meta_data->>'username'
-- or the email local-part. Phone-only signups have neither, producing a NULL
-- username (NOT NULL violation -> 500 on signup). Two emails sharing a local
-- part (john@gmail.com / john@yahoo.com) would also collide on the UNIQUE
-- constraint. This version always yields a non-null base and falls back to a
-- per-user unique suffix when the base is already taken.

create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare
  v_base text;
  v_username text;
  v_suffix text;
begin
  v_base := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    case
      when coalesce(new.phone, '') <> ''
        then 'user_' || right(regexp_replace(new.phone, '\D', '', 'g'), 6)
      else null
    end,
    'user'
  );

  v_username := v_base;

  if exists (select 1 from public.profiles where username = v_username) then
    v_suffix := substr(replace(new.id::text, '-', ''), 1, 8);
    v_username := left(v_base, 24) || '_' || v_suffix;
  end if;

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    v_username,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      v_username
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  return new;
end;
$function$;
