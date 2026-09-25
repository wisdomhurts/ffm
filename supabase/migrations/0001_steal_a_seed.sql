-- Steal A Seed! Family Edition: cloud saves (save codes) and high scores.
--
-- Apply once to the Supabase project (MCP apply_migration or the SQL editor). Written for Postgres 17
-- (also runs on 15/16). It only uses core functions (gen_random_uuid, sha256), so no extension is needed.
--
-- Security model (see supabase/README.md):
--  * Tables live in `public` (prefix sas_), have RLS ENABLED and NO policies, and anon/authenticated have
--    no privileges on them. The Data API can't read or write a single row directly.
--  * All access goes through the SECURITY DEFINER functions below (search_path = '', fully qualified
--    names). Only the public RPCs are executable by anon/authenticated; helpers are revoked.
--  * A player is (id, secret). The secret is 256 random bits, returned once and stored only as a salted
--    SHA-256. The save code (SEED-XXXX-XXXX) is the credential for moving to another device: loading it
--    rotates the secret, so the save "moves" to the new device and the old one stops writing.
--  * Inputs are validated server-side (board whitelist, finite capped values, name charset/length +
--    blocklist, payload sizes); writes are rate limited per player, code lookups and sign-ups per IP.

-- ------------------------------------------------------------------------------------------ tables

create table if not exists public.sas_players (
  id            uuid primary key default gen_random_uuid(),
  secret_hash   bytea not null,
  secret_salt   bytea not null,
  save_code     text not null unique
                check (save_code ~ '^SEED-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$'),
  name          text not null check (char_length(name) between 1 and 14),
  base          text not null check (base in ('dorian', 'esther', 'maddie', 'micah')),
  look          jsonb not null default '{}'::jsonb check (jsonb_typeof(look) = 'object' and octet_length(look::text) <= 2048),
  save          jsonb check (save is null or (jsonb_typeof(save) = 'object' and octet_length(save::text) <= 204800)),
  saves         integer not null default 0,        -- number of cloud saves written
  loads         integer not null default 0,        -- number of times the code was loaded on a device
  listed        boolean not null default true,     -- the player's choice: show me on the global boards
  banned        boolean not null default false,    -- moderation: hides from boards and blocks writes
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  saved_at      timestamptz,                       -- last successful sas_save
  loaded_at     timestamptz,                       -- last sas_load (secret rotation)
  last_write_at timestamptz                        -- rate limit for sas_save (1 per 5 s)
);

create table if not exists public.sas_scores (
  player_id    uuid not null references public.sas_players (id) on delete cascade,
  board        text not null check (board in ('networth', 'showdown', 'steals', 'rebirths')),
  value        double precision not null check (value >= 0 and value < 'infinity'::double precision),   -- all-time best
  week_value   double precision not null default 0 check (week_value >= 0 and week_value < 'infinity'::double precision),
  week_start   date not null,                     -- Monday (UTC) of the week week_value belongs to
  name         text not null,                     -- denormalized for fast top-N reads
  base         text not null,
  look         jsonb not null default '{}'::jsonb check (jsonb_typeof(look) = 'object' and octet_length(look::text) <= 2048),
  hidden       boolean not null default false,    -- not listed or banned
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),   -- when `value` last improved
  week_at      timestamptz not null default now(),   -- when `week_value` last improved
  submitted_at timestamptz not null default now(),   -- rate limit for sas_submit (1 per 5 s per board)
  primary key (player_id, board)
);

create index if not exists sas_scores_top_all_idx on public.sas_scores (board, value desc, updated_at) where not hidden;
create index if not exists sas_scores_top_week_idx on public.sas_scores (board, week_start, week_value desc, week_at) where not hidden;

-- Fixed-window counters for abuse limits (keys hold a hash of the client IP, never the IP itself).
create table if not exists public.sas_guard (
  key          text primary key,
  window_start timestamptz not null default now(),
  hits         integer not null default 0
);

alter table public.sas_players enable row level security;
alter table public.sas_scores enable row level security;
alter table public.sas_guard enable row level security;

-- No direct table access for API roles (Supabase grants these by default in `public`).
revoke all on table public.sas_players, public.sas_scores, public.sas_guard from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------ helpers

-- n cryptographically random bytes (gen_random_uuid uses the server's strong RNG; the 13 bytes of each
-- UUID that carry no version/variant bits are used).
create or replace function public.sas_rand(p_n integer)
returns bytea
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_out bytea := ''::bytea;
  v_u bytea;
begin
  while octet_length(v_out) < p_n loop
    v_u := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
    v_out := v_out || substring(v_u from 1 for 6) || substring(v_u from 10 for 7);
  end loop;
  return substring(v_out from 1 for p_n);
end;
$$;

-- A new save code like SEED-7K4Q-9XPM (32-letter alphabet without 0/O/1/I: 40 random bits).
create or replace function public.sas_new_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_alpha constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_b bytea := public.sas_rand(8);
  v_s text := '';
begin
  for i in 0..7 loop
    v_s := v_s || substr(c_alpha, (get_byte(v_b, i) & 31) + 1, 1);
  end loop;
  return 'SEED-' || substr(v_s, 1, 4) || '-' || substr(v_s, 5, 4);
end;
$$;

-- Canonical form of a typed code: case, spaces and dashes don't matter; the SEED prefix is optional.
-- Returns null when it can't be a valid code.
create or replace function public.sas_norm_code(p_code text)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_s text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if char_length(v_s) = 12 and left(v_s, 4) = 'SEED' then
    v_s := substr(v_s, 5);
  end if;
  if v_s !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$' then
    return null;
  end if;
  return 'SEED-' || substr(v_s, 1, 4) || '-' || substr(v_s, 5, 4);
end;
$$;

-- Name filter, an exact mirror of src/core/names.js (tests/online/names.test.mjs checks the lists match):
-- the name is folded to a-z (accents dropped, look-alike Cyrillic/Greek letters and leetspeak mapped) and
-- split into words. STRONG words are blocked at the start or end of a word (also with an ending), MILD
-- words only as a whole word (optionally with a simple ending), and runs of 1-2 letter words are also
-- checked glued together ("f u c k"). Letters of other scripts can't be filtered and are accepted.
create or replace function public.sas_name_word_bad(p_t text)
returns boolean
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  c_strong constant text[] := array[
    'fuck', 'fck', 'fvck', 'phuck', 'shit', 'bitch', 'btch', 'cunt', 'nigg', 'faggot', 'retard', 'pussy',
    'penis', 'vagin', 'hitler', 'kkk', 'twat', 'dildo', 'jizz', 'asshole', 'cocksuck', 'suicide'];
  c_strong_end constant text[] := array[
    '', 's', 'es', 'er', 'ers', 'ing', 'in', 'ed', 'y', 'ey', 'face', 'head', 'hole'];
  c_mild constant text[] := array[
    'kill', 'kys', 'rape', 'rapist', 'rapey', 'cock', 'sex', 'sexy', 'nazi', 'anal', 'anus', 'cum', 'arse',
    'arsehole', 'crap', 'crappy', 'damn', 'tits', 'titty', 'titties', 'dick', 'dickhead', 'porn', 'porno',
    'porny', 'boob', 'boobie', 'boobies', 'slut', 'slutty', 'whore', 'bastard', 'ass', 'asshat', 'asswipe',
    'assface', 'dumbass', 'jackass', 'smartass', 'fatass', 'badass', 'fag', 'faggy', 'fuk', 'fcuk', 'wank',
    'piss', 'milf', 'horny', 'nude', 'naked', 'bollock'];
  c_mild_end constant text[] := array[
    '', 's', 'es', 'er', 'ers', 'ing', 'ed'];
  c_allow constant text[] := array[
    'cocker', 'shital', 'shitara', 'ashit'];
  v_w text;
  v_e text;
begin
  if p_t = any (c_allow) then
    return false;
  end if;
  foreach v_w in array c_strong loop
    if starts_with(p_t, v_w) then
      return true;
    end if;
    foreach v_e in array c_strong_end loop
      if char_length(p_t) >= char_length(v_w || v_e) and right(p_t, char_length(v_w || v_e)) = v_w || v_e then
        return true;
      end if;
    end loop;
  end loop;
  foreach v_w in array c_mild loop
    foreach v_e in array c_mild_end loop
      if p_t = v_w || v_e then
        return true;
      end if;
    end loop;
  end loop;
  return false;
end;
$$;

-- true when no word of the name is on the blocklists
create or replace function public.sas_name_ok(p_name text)
returns boolean
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_s text;
  v_t text;
  v_run text := '';
  v_runn integer := 0;
begin
  v_s := regexp_replace(normalize(coalesce(p_name, ''), NFKD), '[\u0300-\u036f]', '', 'g');
  v_s := translate(v_s, 'аАвВсСеЕнНіІјЈкКмМоОрРѕЅтТуУхХԁԛԝαΑβΒεΕιΙκΚΜμνΝοΟρΡτΤυΥχΧΖıłŁøØđĐɑƒ', 'aabbcceehhiijjkkmmooppssttyyxxdqwaabbeeiikkmuvnooppttuyxxzillooddaf');
  v_s := lower(v_s);
  v_s := translate(v_s, '013457@$!|8', 'oieastasiib');
  for v_t in
    select w.x from regexp_split_to_table(v_s, '[^a-z]+') with ordinality as w(x, n) where w.x <> '' order by w.n
  loop
    if char_length(v_t) <= 2 then
      v_run := v_run || v_t;
      v_runn := v_runn + 1;
    else
      if v_runn >= 2 and public.sas_name_word_bad(v_run) then
        return false;
      end if;
      v_run := '';
      v_runn := 0;
    end if;
    if public.sas_name_word_bad(v_t) then
      return false;
    end if;
  end loop;
  return not (v_runn >= 2 and public.sas_name_word_bad(v_run));
end;
$$;

-- Kid-safe display name, mirroring sanitizeName in src/core/names.js: after NFKC and whitespace folding,
-- 1-14 characters of letters of any script, digits, space and _ . ' - (combining accents only right after
-- a letter, at most two in a row; no invisible, symbol, emoji or private-use characters), and allowed by
-- sas_name_ok. Returns p_fallback when the name isn't acceptable.
create or replace function public.sas_clean_name(p_name text, p_fallback text)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_s text;
  v_c integer;
  v_prev_letter boolean := false;
  v_marks integer := 0;
begin
  if p_name is null then
    return p_fallback;
  end if;
  v_s := btrim(regexp_replace(normalize(p_name, NFKC), '\s+', ' ', 'g'));
  if char_length(v_s) < 1 or char_length(v_s) > 14 then
    return p_fallback;
  end if;
  for i in 1..char_length(v_s) loop
    v_c := ascii(substr(v_s, i, 1));
    if v_c between 768 and 879 then
      -- combining accent: must follow a letter, at most two in a row (no "zalgo" text)
      v_marks := v_marks + 1;
      if not v_prev_letter or v_marks > 2 then
        return p_fallback;
      end if;
      continue;
    end if;
    v_marks := 0;
    if v_c between 65 and 90 or v_c between 97 and 122 then
      v_prev_letter := true;
    elsif v_c between 48 and 57 or v_c in (32, 39, 45, 46, 95) then
      v_prev_letter := false;
    elsif v_c >= 192 and not (
         v_c in (215, 247, 1564, 5760, 6158, 12644, 65279)       -- x, divide, Arabic letter mark, Ogham space, Mongolian vowel separator, Hangul filler, BOM
      or v_c between 4447 and 4448                               -- Hangul choseong/jungseong fillers
      or v_c between 8192 and 11263                              -- punctuation, symbols, arrows, math, shapes, dingbats (incl. zero-width and bidi controls)
      or v_c between 11776 and 11903                             -- supplemental punctuation
      or v_c between 12288 and 12292 or v_c between 12294 and 12351 -- CJK punctuation (keeps the name mark U+3005)
      or v_c between 55296 and 63743                             -- surrogates, private use
      or v_c between 65024 and 65135                             -- variation selectors, CJK compatibility forms
      or v_c between 65280 and 65535                             -- half/full-width forms, specials
      or v_c between 126976 and 129791                           -- emoji and pictographs
      or v_c >= 917504                                           -- tags, variation selectors supplement, private use
    ) then
      v_prev_letter := true;
    else
      return p_fallback;
    end if;
  end loop;
  if not public.sas_name_ok(v_s) then
    return p_fallback;
  end if;
  return v_s;
end;
$$;

-- A Look (docs/ONLINE.md) is a flat object of short scalar fields. Anything else is dropped.
-- Returns null for non-objects and for looks over 2048 bytes, so callers keep the previous look. The result
-- is a subset of the input, so it always fits the 2048-byte check on sas_players.look / sas_scores.look.
create or replace function public.sas_clean_look(p_look jsonb)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_look is null or jsonb_typeof(p_look) <> 'object' or octet_length(p_look::text) > 2048 then null
    else coalesce((
      select jsonb_object_agg(e.key, e.value)
      from (
        select k.key, k.value
        from jsonb_each(p_look) as k
        where k.key ~ '^[A-Za-z0-9_]{1,24}$'
          and (jsonb_typeof(k.value) in ('null', 'boolean', 'number')
               or (jsonb_typeof(k.value) = 'string' and char_length(k.value #>> '{}') <= 40))
        order by k.key
        limit 32
      ) as e
    ), '{}'::jsonb)
  end;
$$;

-- Hash of the caller's IP (from the API gateway headers) for abuse limits. Never stores the raw IP.
create or replace function public.sas_ip_key()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_h json;
  v_ip text;
begin
  begin
    v_h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_h := null;
  end;
  v_ip := coalesce(
    nullif(btrim(v_h ->> 'cf-connecting-ip'), ''),
    nullif(btrim(v_h ->> 'x-real-ip'), ''),
    nullif(btrim(split_part(v_h ->> 'x-forwarded-for', ',', 1)), ''),
    'unknown');
  return left(encode(sha256(convert_to(v_ip, 'UTF8')), 'hex'), 32);
end;
$$;

-- true while `key` has had fewer than p_limit hits in the current window
create or replace function public.sas_guard_ok(p_key text, p_limit integer, p_window interval)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select g.hits < p_limit or g.window_start < now() - p_window
    from public.sas_guard as g
    where g.key = p_key), true);
$$;

create or replace function public.sas_guard_hit(p_key text, p_window interval)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.sas_guard as g (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set hits = case when g.window_start < now() - p_window then 1 else g.hits + 1 end,
        window_start = case when g.window_start < now() - p_window then now() else g.window_start end;
  -- keep the table small
  if random() < 0.02 then
    delete from public.sas_guard as o where o.window_start < now() - interval '2 days';
  end if;
end;
$$;

-- The player row for (id, secret), locked for update. Raises bad_secret (HTTP 403) otherwise.
create or replace function public.sas_auth(p_id uuid, p_secret text)
returns public.sas_players
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.sas_players;
begin
  if p_id is null or p_secret is null or p_secret !~ '^[0-9a-f]{64}$' then
    raise exception 'bad_secret' using errcode = 'PT403', hint = 'Unknown player or wrong secret.';
  end if;
  select * into v from public.sas_players as p where p.id = p_id for update;
  if not found or v.banned or v.secret_hash <> sha256(v.secret_salt || convert_to(p_secret, 'UTF8')) then
    raise exception 'bad_secret' using errcode = 'PT403', hint = 'Unknown player or wrong secret.';
  end if;
  return v;
end;
$$;

create or replace function public.sas_week()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (date_trunc('week', now() at time zone 'utc'))::date;
$$;

-- --------------------------------------------------------------------------------------- public RPCs

-- Create a cloud player. Returns {id, secret, code}. The secret is shown to the client only here (and on
-- sas_load); keep it on the device. Limited to 20 sign-ups per IP per hour (3000/hour overall).
create or replace function public.sas_register(p_name text, p_base text, p_look jsonb default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ip text := public.sas_ip_key();
  v_id uuid;
  v_secret text;
  v_salt bytea;
  v_code text;
  v_tries integer := 0;
begin
  if p_base is null or p_base not in ('dorian', 'esther', 'maddie', 'micah') then
    raise exception 'bad_base' using errcode = '22023';
  end if;
  if not public.sas_guard_ok('reg:' || v_ip, 20, interval '1 hour')
     or not public.sas_guard_ok('reg:*', 3000, interval '1 hour') then
    raise exception 'rate_limited' using errcode = 'PT429', hint = 'Too many new save codes right now. Try again later.';
  end if;
  v_secret := encode(public.sas_rand(32), 'hex');
  v_salt := public.sas_rand(16);
  loop
    v_code := public.sas_new_code();
    begin
      insert into public.sas_players (secret_hash, secret_salt, save_code, name, base, look)
      values (sha256(v_salt || convert_to(v_secret, 'UTF8')), v_salt, v_code,
              public.sas_clean_name(p_name, 'Player'), p_base, coalesce(public.sas_clean_look(p_look), '{}'::jsonb))
      returning id into v_id;
      exit;
    exception when unique_violation then
      v_tries := v_tries + 1;
      if v_tries > 8 then
        raise;
      end if;
    end;
  end loop;
  perform public.sas_guard_hit('reg:' || v_ip, interval '1 hour');
  perform public.sas_guard_hit('reg:*', interval '1 hour');
  return jsonb_build_object('id', v_id, 'secret', v_secret, 'code', v_code);
end;
$$;

-- Store the player's save (a JSON object up to 200 KB). Optional new name/look (invalid ones are ignored).
-- One write per 5 s per player. Returns {ok, saved_at}.
create or replace function public.sas_save(p_id uuid, p_secret text, p_save jsonb, p_name text default null, p_look jsonb default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.sas_players;
  v_name text;
  v_look jsonb;
begin
  v := public.sas_auth(p_id, p_secret);
  if v.last_write_at is not null and v.last_write_at > now() - interval '5 seconds' then
    raise exception 'rate_limited' using errcode = 'PT429', hint = 'One save every 5 seconds.';
  end if;
  if p_save is null or jsonb_typeof(p_save) <> 'object' then
    raise exception 'bad_save' using errcode = '22023';
  end if;
  if octet_length(p_save::text) > 204800 then
    raise exception 'too_big' using errcode = 'PT413', hint = 'Saves are limited to 200 KB.';
  end if;
  v_name := coalesce(public.sas_clean_name(p_name, null), v.name);
  v_look := coalesce(public.sas_clean_look(p_look), v.look);
  update public.sas_players as p
     set save = p_save, name = v_name, look = v_look, saves = p.saves + 1,
         saved_at = now(), updated_at = now(), last_write_at = now()
   where p.id = v.id;
  update public.sas_scores as s
     set name = v_name, look = v_look
   where s.player_id = v.id and (s.name <> v_name or s.look <> v_look);
  return jsonb_build_object('ok', true, 'saved_at', now());
end;
$$;

-- Preview a save code before loading it: {name, base, look, summary, has_save, saved_at}, or null when
-- no such code. Unknown codes count against the caller's IP (20 per 10 min; 1000 per 10 min overall).
create or replace function public.sas_peek(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text := public.sas_norm_code(p_code);
  v_ip text := public.sas_ip_key();
  v public.sas_players;
begin
  if v_code is null then
    raise exception 'bad_code' using errcode = '22023', hint = 'Save codes look like SEED-7K4Q-9XPM.';
  end if;
  if not public.sas_guard_ok('load:' || v_ip, 20, interval '10 minutes')
     or not public.sas_guard_ok('load:*', 1000, interval '10 minutes') then
    raise exception 'rate_limited' using errcode = 'PT429', hint = 'Too many wrong codes. Wait a few minutes.';
  end if;
  select * into v from public.sas_players as p where p.save_code = v_code and not p.banned;
  if not found then
    perform public.sas_guard_hit('load:' || v_ip, interval '10 minutes');
    perform public.sas_guard_hit('load:*', interval '10 minutes');
    return null;
  end if;
  return jsonb_build_object(
    'name', v.name, 'base', v.base, 'look', v.look,
    'summary', case when jsonb_typeof(v.save -> 'summary') = 'object' then v.save -> 'summary' else '{}'::jsonb end,
    'has_save', v.save is not null, 'saved_at', v.saved_at);
end;
$$;

-- Move a save to this device: returns {id, secret, code, name, base, look, save, saved_at} or null when no
-- such code. Issues a NEW secret (the device that had it before gets bad_secret from then on). Same
-- per-IP limits as sas_peek.
create or replace function public.sas_load(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text := public.sas_norm_code(p_code);
  v_ip text := public.sas_ip_key();
  v public.sas_players;
  v_secret text;
  v_salt bytea;
begin
  if v_code is null then
    raise exception 'bad_code' using errcode = '22023', hint = 'Save codes look like SEED-7K4Q-9XPM.';
  end if;
  if not public.sas_guard_ok('load:' || v_ip, 20, interval '10 minutes')
     or not public.sas_guard_ok('load:*', 1000, interval '10 minutes') then
    raise exception 'rate_limited' using errcode = 'PT429', hint = 'Too many wrong codes. Wait a few minutes.';
  end if;
  select * into v from public.sas_players as p where p.save_code = v_code and not p.banned for update;
  if not found then
    perform public.sas_guard_hit('load:' || v_ip, interval '10 minutes');
    perform public.sas_guard_hit('load:*', interval '10 minutes');
    return null;
  end if;
  v_secret := encode(public.sas_rand(32), 'hex');
  v_salt := public.sas_rand(16);
  update public.sas_players as p
     set secret_hash = sha256(v_salt || convert_to(v_secret, 'UTF8')), secret_salt = v_salt,
         loads = p.loads + 1, loaded_at = now(), last_write_at = null
   where p.id = v.id;
  return jsonb_build_object(
    'id', v.id, 'secret', v_secret, 'code', v.save_code, 'name', v.name, 'base', v.base, 'look', v.look,
    'save', v.save, 'saved_at', v.saved_at);
end;
$$;

-- Submit a score. Keeps the best value per board (all time, and for the current UTC week).
-- Boards: networth, showdown, steals, rebirths. One submit per 5 s per board. Returns {board, best, week}.
create or replace function public.sas_submit(p_id uuid, p_secret text, p_board text, p_value double precision,
                                             p_name text default null, p_look jsonb default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.sas_players;
  s public.sas_scores;
  v_cap double precision;
  v_week date := public.sas_week();
  v_name text;
  v_look jsonb;
  v_hidden boolean;
begin
  v_cap := case p_board
    when 'networth' then 1e18
    when 'showdown' then 1e15
    when 'steals' then 1e7
    when 'rebirths' then 1e3
  end;
  if v_cap is null then
    raise exception 'bad_board' using errcode = '22023';
  end if;
  -- NaN sorts above every number in Postgres, so the cap also rejects NaN and infinity
  if p_value is null or not (p_value >= 0 and p_value <= v_cap) then
    raise exception 'bad_value' using errcode = '22023';
  end if;
  if p_board in ('steals', 'rebirths') and p_value <> floor(p_value) then
    raise exception 'bad_value' using errcode = '22023';
  end if;
  v := public.sas_auth(p_id, p_secret);
  v_name := coalesce(public.sas_clean_name(p_name, null), v.name);
  v_look := coalesce(public.sas_clean_look(p_look), v.look);
  v_hidden := not v.listed or v.banned;
  select * into s from public.sas_scores as x where x.player_id = v.id and x.board = p_board for update;
  if not found then
    insert into public.sas_scores as x (player_id, board, value, week_value, week_start, name, base, look, hidden)
    values (v.id, p_board, p_value, p_value, v_week, v_name, v.base, v_look, v_hidden)
    returning * into s;
  else
    if s.submitted_at > now() - interval '5 seconds' then
      raise exception 'rate_limited' using errcode = 'PT429', hint = 'One score per board every 5 seconds.';
    end if;
    update public.sas_scores as x
       set value        = greatest(x.value, p_value),
           updated_at   = case when p_value > x.value then now() else x.updated_at end,
           week_value   = case when x.week_start = v_week then greatest(x.week_value, p_value) else p_value end,
           week_at      = case when x.week_start <> v_week or p_value > x.week_value then now() else x.week_at end,
           week_start   = v_week,
           name         = v_name,
           look         = v_look,
           hidden       = v_hidden,
           submitted_at = now()
     where x.player_id = v.id and x.board = p_board
    returning * into s;
  end if;
  if v.name <> v_name or v.look <> v_look then
    update public.sas_players as p set name = v_name, look = v_look, updated_at = now() where p.id = v.id;
  end if;
  return jsonb_build_object('board', s.board, 'best', s.value, 'week', s.week_value);
end;
$$;

-- Top scores of a board: rank, name, base, look, value, updated_at, me. period 'all' | 'week' (since
-- Monday 00:00 UTC). Pass p_me (your player id) to flag your row; if you are outside the top p_limit
-- (1-100, default 50) your row is appended with its real rank.
create or replace function public.sas_top(p_board text, p_limit integer default 50, p_period text default 'all', p_me uuid default null)
returns table (rank integer, name text, base text, look jsonb, value double precision, updated_at timestamptz, me boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_lim integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_week date := public.sas_week();
begin
  if p_board is null or p_board not in ('networth', 'showdown', 'steals', 'rebirths') then
    raise exception 'bad_board' using errcode = '22023';
  end if;
  if coalesce(p_period, 'all') not in ('all', 'week') then
    raise exception 'bad_period' using errcode = '22023';
  end if;
  if coalesce(p_period, 'all') = 'all' then
    return query
      with top as (
        select s.player_id, s.name as n, s.base as b, s.look as l, s.value as v, s.updated_at as t
        from public.sas_scores as s
        where s.board = p_board and not s.hidden and s.value > 0
        order by s.value desc, s.updated_at asc
        limit v_lim
      )
      select r.rk, r.n, r.b, r.l, r.v, r.t, r.mine
      from (
        select (pg_catalog.rank() over (order by top.v desc))::integer as rk, top.n, top.b, top.l, top.v, top.t,
               coalesce(top.player_id = p_me, false) as mine
        from top
        union all
        select (1 + (select count(*) from public.sas_scores as o
                     where o.board = p_board and not o.hidden and o.value > m.value))::integer,
               m.name, m.base, m.look, m.value, m.updated_at, true
        from public.sas_scores as m
        where p_me is not null and m.player_id = p_me and m.board = p_board and not m.hidden and m.value > 0
          and not exists (select 1 from top where top.player_id = p_me)
      ) as r
      order by r.rk, r.t;
  else
    return query
      with top as (
        select s.player_id, s.name as n, s.base as b, s.look as l, s.week_value as v, s.week_at as t
        from public.sas_scores as s
        where s.board = p_board and not s.hidden and s.week_start = v_week and s.week_value > 0
        order by s.week_value desc, s.week_at asc
        limit v_lim
      )
      select r.rk, r.n, r.b, r.l, r.v, r.t, r.mine
      from (
        select (pg_catalog.rank() over (order by top.v desc))::integer as rk, top.n, top.b, top.l, top.v, top.t,
               coalesce(top.player_id = p_me, false) as mine
        from top
        union all
        select (1 + (select count(*) from public.sas_scores as o
                     where o.board = p_board and not o.hidden and o.week_start = v_week and o.week_value > m.week_value))::integer,
               m.name, m.base, m.look, m.week_value, m.week_at, true
        from public.sas_scores as m
        where p_me is not null and m.player_id = p_me and m.board = p_board and not m.hidden
          and m.week_start = v_week and m.week_value > 0
          and not exists (select 1 from top where top.player_id = p_me)
      ) as r
      order by r.rk, r.t;
  end if;
end;
$$;

-- Show or hide me on the global boards (my scores stay stored). Returns {listed}.
create or replace function public.sas_listed(p_id uuid, p_secret text, p_listed boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.sas_players;
begin
  v := public.sas_auth(p_id, p_secret);
  update public.sas_players as p set listed = coalesce(p_listed, true), updated_at = now() where p.id = v.id;
  update public.sas_scores as s set hidden = not coalesce(p_listed, true) or v.banned where s.player_id = v.id;
  return jsonb_build_object('listed', coalesce(p_listed, true));
end;
$$;

-- Forget me: deletes the cloud save, the code and all scores. Returns true.
create or replace function public.sas_delete(p_id uuid, p_secret text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.sas_players;
begin
  v := public.sas_auth(p_id, p_secret);
  delete from public.sas_players as p where p.id = v.id;
  return true;
end;
$$;

-- ------------------------------------------------------------------------ maintenance (not exposed)

-- Moderation from the SQL editor: select public.sas_ban('SEED-XXXX-XXXX', true);
create or replace function public.sas_ban(p_code text, p_banned boolean default true)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.sas_players as p set banned = coalesce(p_banned, true), updated_at = now()
   where p.save_code = public.sas_norm_code(p_code)
  returning p.id into v_id;
  if v_id is null then
    return false;
  end if;
  update public.sas_scores as s set hidden = coalesce(p_banned, true) or not pl.listed
    from public.sas_players as pl where pl.id = v_id and s.player_id = v_id;
  return true;
end;
$$;

-- Housekeeping (e.g. weekly with pg_cron): players that never saved and never scored after 30 days,
-- and stale abuse counters. Returns the number of players removed.
create or replace function public.sas_prune()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from public.sas_players as p
   where p.save is null and p.created_at < now() - interval '30 days'
     and not exists (select 1 from public.sas_scores as s where s.player_id = p.id);
  get diagnostics v_n = row_count;
  delete from public.sas_guard as g where g.window_start < now() - interval '2 days';
  return v_n;
end;
$$;

-- ------------------------------------------------------------------------------------------- grants

-- Nothing is executable by default (Postgres grants EXECUTE to PUBLIC; Supabase also to anon/authenticated)...
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'sas\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end;
$$;

-- ...except the game's RPCs.
grant execute on function
  public.sas_register(text, text, jsonb),
  public.sas_save(uuid, text, jsonb, text, jsonb),
  public.sas_peek(text),
  public.sas_load(text),
  public.sas_submit(uuid, text, text, double precision, text, jsonb),
  public.sas_top(text, integer, text, uuid),
  public.sas_listed(uuid, text, boolean),
  public.sas_delete(uuid, text)
to anon, authenticated;

comment on table public.sas_players is 'Steal A Seed cloud players + saves. RLS on, no policies: use the sas_* RPCs.';
comment on table public.sas_scores is 'Steal A Seed best score per player and board. RLS on, no policies: use sas_submit / sas_top.';
comment on table public.sas_guard is 'Steal A Seed abuse counters (hashed IPs). Internal.';

-- let the Data API see the new functions right away
notify pgrst, 'reload schema';
