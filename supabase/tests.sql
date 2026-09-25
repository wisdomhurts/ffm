-- Steal A Seed: sanity checks for migrations/0001_steal_a_seed.sql.
--
-- Run AFTER applying the migration, as the `postgres` role (Supabase MCP execute_sql or the SQL editor),
-- as ONE script. It calls the RPCs as `anon` (the role the game uses), checks the answers, removes every
-- row it created and ends with a single result table:
--
--   n | check | pass | detail
--
-- EXPECTED RESULT: 42 rows, every `pass` = true (the last row, "all checks passed", says so). Safe to run
-- on a live project and to run again: it only touches rows it created (names start with "Test") and puts
-- the global abuse counters back. Rows (expected detail in brackets):
--   1-3  RLS on sas_scores / sas_players / sas_guard, no policies                   [rls=t policies=0]
--   4    anon/authenticated/PUBLIC have no privileges on any sas_ table             [0 grants]
--   5    every sas_ function is SECURITY DEFINER with search_path=''                 [0 bad]
--   6    anon + authenticated can execute the 8 RPCs                                 [8/8]
--   7    they can NOT execute the 14 helpers                                         [0/14]
--   8    anon can't read sas_players directly                                        [permission denied for table sas_players]
--   9    sas_register -> {id, secret (64 hex), code}                                 [SEED-XXXX-XXXX]
--   10   the secret is stored only as a salted SHA-256                               [no plaintext]
--   11   a rude name is replaced on register                                         [Player]
--   12   sas_save ok                                                                 [{"v": {"ok": true, ...}}]
--   13   second save within 5 s                                                      [rate_limited]
--   14   wrong secret                                                                [bad_secret]
--   15   save over 200 KB                                                            [too_big]
--   16   non-object save                                                             [bad_save]
--   17   sas_peek with a messy code (lower case, spaces) -> name + summary, no secret/save
--   18   unknown code                                                                [null]
--   19   malformed code                                                              [bad_code]
--   20   sas_load -> the save + a NEW secret                                         [the code]
--   21   the old secret stops working after a load                                   [bad_secret]
--   22   the new secret works; sas_submit stores the best                            [{"best": 1000, ...}]
--   23   a lower value doesn't replace the best                                      [{"best": 1000, ...}]
--   24   unknown board                                                               [bad_board]
--   25   NaN / infinity / negative / fractional / huge values are refused            []
--   26   same board again within 5 s                                                 [rate_limited]
--   27   sas_top order; the two 800s share a rank, the next rank skips one           [[r,1000],[r+1,800],[r+1,800],[r+3,300],[r+4,100]]
--   28   limit                                                                       [2 rows]
--   29   p_me flags my row                                                           [1 me rows]
--   30   my row is appended with its real rank when I'm outside the top N
--   31   the week board ignores last week's scores                                   [week*10+all=1]
--   32   unlisted players (sas_listed false) are hidden                              [0 rows]
--   33   banned players (sas_ban) are hidden                                         [0 rows]
--   34   sas_top with an unknown board                                               [bad_board]
--   35   20 unknown codes from one IP -> the next lookup                             [rate_limited]
--   36   sas_delete removes the player and their scores                              [0 rows left]
--   37   look keeps only flat short scalar fields                                    [{"hat": "crown", "shirtColor": "#ff00aa"}]
--   38   real names are kept: Killian, Ana Lopez, Grape, Peacock, Essex, Nazir, ... [all kept]
--   39   rude names (spaced, leet, accented, look-alike letters) become Player       [all refused]
--   40   an oversized look is dropped, never an error (register + save)             [ look={}]
--   41   test rows cleaned up                                                        [0 left]
--   42   all checks passed                                                           [0 failed]

create temp table if not exists sas_test_results (n serial, "check" text, pass boolean, detail text);
truncate sas_test_results;

create or replace function pg_temp.sas_ok(p_check text, p_pass boolean, p_detail text default null)
returns void language sql as $$
  insert into sas_test_results ("check", pass, detail) values (p_check, coalesce(p_pass, false), p_detail);
$$;

-- run `sql` as anon; returns {ok, v} or {ok:false, err}
create or replace function pg_temp.sas_anon(p_sql text)
returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  perform set_config('role', 'anon', true);
  execute p_sql into v;
  perform set_config('role', 'none', true);
  return jsonb_build_object('ok', true, 'v', v);
exception when others then
  return jsonb_build_object('ok', false, 'err', sqlerrm, 'state', sqlstate);
end;
$$;

do $$
declare
  c_rpcs constant text[] := array[
    'public.sas_register(text,text,jsonb)', 'public.sas_save(uuid,text,jsonb,text,jsonb)', 'public.sas_peek(text)',
    'public.sas_load(text)', 'public.sas_submit(uuid,text,text,double precision,text,jsonb)',
    'public.sas_top(text,integer,text,uuid)', 'public.sas_listed(uuid,text,boolean)', 'public.sas_delete(uuid,text)'];
  c_helpers constant text[] := array[
    'public.sas_rand(integer)', 'public.sas_new_code()', 'public.sas_norm_code(text)', 'public.sas_clean_name(text,text)',
    'public.sas_clean_look(jsonb)', 'public.sas_ip_key()', 'public.sas_guard_ok(text,integer,interval)',
    'public.sas_guard_hit(text,interval)', 'public.sas_auth(uuid,text)', 'public.sas_week()', 'public.sas_ban(text,boolean)',
    'public.sas_prune()', 'public.sas_name_ok(text)', 'public.sas_name_word_bad(text)'];
  v_ids uuid[] := '{}';
  r jsonb;
  a jsonb;  b jsonb;  c jsonb;  d jsonb;
  v_n integer;
  v_t text;
  v_ok boolean;
  v_code text;
  v_guard jsonb;
  v_ipkeys text[] := '{}';
  f record;
begin
  -- keep the real global abuse counters as they were
  select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) into v_guard from public.sas_guard g where g.key in ('reg:*', 'load:*');
  perform set_config('request.headers', '{"x-forwarded-for": "203.0.113.77, 10.0.0.1"}', true);
  v_ipkeys := array['reg:' || public.sas_ip_key(), 'load:' || public.sas_ip_key()];

  -- 1-3 RLS
  for f in select c.relname, c.relrowsecurity, (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as pol
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname in ('sas_players', 'sas_scores', 'sas_guard') order by c.relname desc loop
    perform pg_temp.sas_ok('RLS on ' || f.relname || ', no policies', f.relrowsecurity and f.pol = 0, format('rls=%s policies=%s', f.relrowsecurity, f.pol));
  end loop;

  -- 4 table grants
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name like 'sas\_%' and grantee in ('anon', 'authenticated', 'PUBLIC');
  perform pg_temp.sas_ok('API roles have no table privileges', v_n = 0, v_n || ' grants');

  -- 5 definer + search_path
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'sas\_%'
     and (not p.prosecdef or not coalesce(p.proconfig @> array['search_path=""'], false));
  perform pg_temp.sas_ok('functions are SECURITY DEFINER with search_path=''''', v_n = 0, v_n || ' bad');

  -- 6-7 execute grants
  select count(*) into v_n from unnest(c_rpcs) u(sig) where has_function_privilege('anon', u.sig, 'execute') and has_function_privilege('authenticated', u.sig, 'execute');
  perform pg_temp.sas_ok('anon can call the RPCs', v_n = array_length(c_rpcs, 1), v_n || '/' || array_length(c_rpcs, 1));
  select count(*) into v_n from unnest(c_helpers) u(sig) where has_function_privilege('anon', u.sig, 'execute') or has_function_privilege('authenticated', u.sig, 'execute');
  perform pg_temp.sas_ok('anon can NOT call helpers', v_n = 0, v_n || '/' || array_length(c_helpers, 1));

  -- 8 direct read
  r := pg_temp.sas_anon('select count(*)::text::jsonb from public.sas_players');
  perform pg_temp.sas_ok('anon cannot read sas_players', not (r ->> 'ok')::boolean and r ->> 'err' like 'permission denied%', r ->> 'err');

  -- 9-11 register
  a := pg_temp.sas_anon($q$ select public.sas_register('Test Maddie', 'maddie', '{"hat":"crown","shirtColor":"#ff00aa"}') $q$) -> 'v';
  v_ids := v_ids || (a ->> 'id')::uuid;
  perform pg_temp.sas_ok('sas_register returns id, secret, code',
    a ->> 'secret' ~ '^[0-9a-f]{64}$' and a ->> 'code' ~ '^SEED-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$' and (a ->> 'id') is not null, a ->> 'code');
  select count(*) into v_n from public.sas_players p
   where p.id = (a ->> 'id')::uuid and p.secret_hash <> convert_to(a ->> 'secret', 'UTF8')
     and position(convert_to(a ->> 'secret', 'UTF8') in p.secret_hash) = 0 and octet_length(p.secret_hash) = 32;
  perform pg_temp.sas_ok('secret stored only as a salted hash', v_n = 1, 'no plaintext');
  b := pg_temp.sas_anon($q$ select public.sas_register('B1tch', 'micah', null) $q$) -> 'v';
  v_ids := v_ids || (b ->> 'id')::uuid;
  select p.name into v_t from public.sas_players p where p.id = (b ->> 'id')::uuid;
  perform pg_temp.sas_ok('rude name becomes Player', v_t = 'Player', v_t);

  -- 12-16 save
  r := pg_temp.sas_anon(format($q$ select public.sas_save(%L, %L, '{"v":1,"summary":{"netWorth":4200,"stars":7}}', 'Test Maddie', null) $q$, a ->> 'id', a ->> 'secret'));
  perform pg_temp.sas_ok('sas_save stores the save', (r -> 'v' ->> 'ok')::boolean, r::text);
  r := pg_temp.sas_anon(format($q$ select public.sas_save(%L, %L, '{"v":2}') $q$, a ->> 'id', a ->> 'secret'));
  perform pg_temp.sas_ok('second save within 5 s is rate limited', r ->> 'err' = 'rate_limited' and r ->> 'state' = 'PT429', r ->> 'err');
  update public.sas_players p set last_write_at = now() - interval '6 seconds' where p.id = (a ->> 'id')::uuid;
  r := pg_temp.sas_anon(format($q$ select public.sas_save(%L, %L, '{"v":3}') $q$, a ->> 'id', repeat('0', 64)));
  perform pg_temp.sas_ok('wrong secret is refused', r ->> 'err' = 'bad_secret' and r ->> 'state' = 'PT403', r ->> 'err');
  r := pg_temp.sas_anon(format($q$ select public.sas_save(%L, %L, jsonb_build_object('big', repeat('x', 210000))) $q$, a ->> 'id', a ->> 'secret'));
  perform pg_temp.sas_ok('saves over 200 KB are refused', r ->> 'err' = 'too_big', r ->> 'err');
  r := pg_temp.sas_anon(format($q$ select public.sas_save(%L, %L, '[1,2,3]') $q$, a ->> 'id', a ->> 'secret'));
  perform pg_temp.sas_ok('non-object saves are refused', r ->> 'err' = 'bad_save', r ->> 'err');

  -- 17-19 peek
  v_code := a ->> 'code';
  r := pg_temp.sas_anon(format($q$ select public.sas_peek(%L) $q$, lower(replace(v_code, '-', ' '))));
  perform pg_temp.sas_ok('sas_peek finds a messy code', r -> 'v' ->> 'name' = 'Test Maddie' and (r -> 'v' -> 'summary' ->> 'netWorth')::numeric = 4200
    and not (r -> 'v' ? 'secret') and not (r -> 'v' ? 'save'), r ->> 'v');
  r := pg_temp.sas_anon($q$ select public.sas_peek('SEED-2222-2222') $q$);
  perform pg_temp.sas_ok('unknown code -> null', (r ->> 'ok')::boolean and jsonb_typeof(r -> 'v') is distinct from 'object', coalesce(r ->> 'v', 'null'));
  r := pg_temp.sas_anon($q$ select public.sas_peek('hello') $q$);
  perform pg_temp.sas_ok('malformed code -> bad_code', r ->> 'err' = 'bad_code', r ->> 'err');

  -- 20-22 load rotates the secret
  c := pg_temp.sas_anon(format($q$ select public.sas_load(%L) $q$, v_code)) -> 'v';
  perform pg_temp.sas_ok('sas_load returns the save and a new secret',
    c ->> 'id' = a ->> 'id' and c -> 'save' ->> 'v' = '1' and c ->> 'secret' ~ '^[0-9a-f]{64}$' and c ->> 'secret' <> a ->> 'secret', c ->> 'code');
  r := pg_temp.sas_anon(format($q$ select public.sas_submit(%L, %L, 'steals', 3) $q$, a ->> 'id', a ->> 'secret'));
  perform pg_temp.sas_ok('old secret stops working after a load', r ->> 'err' = 'bad_secret', r ->> 'err');
  a := jsonb_set(a, '{secret}', c -> 'secret');

  -- 23-27 submit
  r := pg_temp.sas_anon(format($q$ select public.sas_submit(%L, %L, 'networth', 1000) $q$, a ->> 'id', a ->> 'secret'));
  perform pg_temp.sas_ok('new secret works; sas_submit keeps the best', (r -> 'v' ->> 'best')::numeric = 1000, r ->> 'v');
  update public.sas_scores s set submitted_at = now() - interval '6 seconds' where s.player_id = (a ->> 'id')::uuid;
  r := pg_temp.sas_anon(format($q$ select public.sas_submit(%L, %L, 'networth', 500) $q$, a ->> 'id', a ->> 'secret'));
  perform pg_temp.sas_ok('a lower score does not replace the best', (r -> 'v' ->> 'best')::numeric = 1000, r ->> 'v');
  r := pg_temp.sas_anon(format($q$ select public.sas_submit(%L, %L, 'coins', 5) $q$, a ->> 'id', a ->> 'secret'));
  perform pg_temp.sas_ok('unknown board -> bad_board', r ->> 'err' = 'bad_board', r ->> 'err');
  v_ok := true;
  foreach v_t in array array['''NaN''', '''Infinity''', '-1', '2.5', '1e9'] loop
    r := pg_temp.sas_anon(format($q$ select public.sas_submit(%L, %L, 'steals', %s) $q$, a ->> 'id', a ->> 'secret', v_t));
    v_ok := v_ok and r ->> 'err' = 'bad_value';
  end loop;
  perform pg_temp.sas_ok('NaN, infinity, negative, fractional and huge values are refused', v_ok, null);
  r := pg_temp.sas_anon(format($q$ select public.sas_submit(%L, %L, 'networth', 9000) $q$, a ->> 'id', a ->> 'secret'));
  perform pg_temp.sas_ok('same board within 5 s -> rate_limited', r ->> 'err' = 'rate_limited', r ->> 'err');

  -- 28-35 top (a board of our own test players: networth values 1000 (a), 800, 800, 300, 100)
  for v_n in 1..4 loop
    d := pg_temp.sas_anon(format($q$ select public.sas_register('Test %s', 'esther', null) $q$, v_n)) -> 'v';
    v_ids := v_ids || (d ->> 'id')::uuid;
    perform pg_temp.sas_anon(format($q$ select public.sas_submit(%L, %L, 'networth', %s) $q$, d ->> 'id', d ->> 'secret', (array[800, 800, 300, 100])[v_n]));
    if v_n = 4 then b := d; end if;
  end loop;
  -- only look at our rows (a real project may already have scores)
  select jsonb_agg(jsonb_build_array(t.rank, t.value) order by t.rank, t.value desc) into r
    from public.sas_top('networth', 100, 'all', null) t where t.name like 'Test%';
  -- expect values 1000, 800, 800, 300, 100 with the two 800s sharing a rank and the next rank skipping one
  perform pg_temp.sas_ok('sas_top orders by value, ties share a rank',
    jsonb_array_length(r) = 5
    and (r -> 0 ->> 1)::numeric = 1000 and (r -> 1 ->> 1)::numeric = 800 and (r -> 2 ->> 1)::numeric = 800
    and (r -> 3 ->> 1)::numeric = 300 and (r -> 4 ->> 1)::numeric = 100
    and (r -> 0 ->> 0)::int < (r -> 1 ->> 0)::int and (r -> 1 ->> 0) = (r -> 2 ->> 0)
    and (r -> 3 ->> 0)::int > (r -> 2 ->> 0)::int + 1 and (r -> 4 ->> 0)::int > (r -> 3 ->> 0)::int, r::text);
  select count(*) into v_n from public.sas_top('networth', 2, 'all', null);
  perform pg_temp.sas_ok('sas_top respects the limit', v_n = 2, v_n || ' rows');
  select count(*) into v_n from public.sas_top('networth', 100, 'all', (a ->> 'id')::uuid) t where t.me and t.name = 'Test Maddie';
  perform pg_temp.sas_ok('sas_top flags my row', v_n = 1, v_n || ' me rows');
  select jsonb_agg(to_jsonb(t)) into r from public.sas_top('networth', 1, 'all', (b ->> 'id')::uuid) t;
  select count(*) into v_n from public.sas_scores s where s.board = 'networth' and not s.hidden and s.value > 100;
  perform pg_temp.sas_ok('my row is appended with its real rank when outside the top N',
    jsonb_array_length(r) = 2 and (r -> 1 ->> 'me')::boolean and (r -> 1 ->> 'rank')::int = v_n + 1, r::text);
  update public.sas_scores s set week_start = public.sas_week() - 7 where s.player_id = (b ->> 'id')::uuid;
  select count(*) into v_n from public.sas_top('networth', 100, 'week', null) t where t.name = 'Test 4';
  select count(*) + v_n * 10 into v_n from public.sas_top('networth', 100, 'all', null) t where t.name = 'Test 4';
  perform pg_temp.sas_ok('week board ignores last week''s scores', v_n = 1, 'week*10+all=' || v_n);
  perform pg_temp.sas_anon(format($q$ select public.sas_listed(%L, %L, false) $q$, b ->> 'id', b ->> 'secret'));
  select count(*) into v_n from public.sas_top('networth', 100, 'all', null) t where t.name = 'Test 4';
  perform pg_temp.sas_ok('unlisted players are hidden', v_n = 0, v_n || ' rows');
  perform public.sas_ban(a ->> 'code', true);
  select count(*) into v_n from public.sas_top('networth', 100, 'all', null) t where t.name = 'Test Maddie';
  perform public.sas_ban(a ->> 'code', false);
  perform pg_temp.sas_ok('banned players are hidden', v_n = 0, v_n || ' rows');
  r := pg_temp.sas_anon($q$ select count(*)::text::jsonb from public.sas_top('gold') $q$);
  perform pg_temp.sas_ok('sas_top bad board -> bad_board', r ->> 'err' = 'bad_board', r ->> 'err');

  -- 36 per-IP limit on unknown codes (the peek above already used 1 of the 20)
  for v_n in 1..19 loop
    perform pg_temp.sas_anon($q$ select public.sas_peek('SEED-2222-2222') $q$);
  end loop;
  r := pg_temp.sas_anon(format($q$ select public.sas_peek(%L) $q$, v_code));
  perform pg_temp.sas_ok('too many unknown codes from one IP -> rate_limited', r ->> 'err' = 'rate_limited', r ->> 'err');

  -- 37 delete
  r := pg_temp.sas_anon(format($q$ select to_jsonb(public.sas_delete(%L, %L)) $q$, b ->> 'id', b ->> 'secret'));
  select count(*) into v_n from public.sas_players p where p.id = (b ->> 'id')::uuid;
  select count(*) + v_n into v_n from public.sas_scores s where s.player_id = (b ->> 'id')::uuid;
  perform pg_temp.sas_ok('sas_delete removes the player and their scores', (r ->> 'v')::boolean and v_n = 0, v_n || ' rows left');

  -- 38 look sanitizing
  select p.look into r from public.sas_players p where p.id = (a ->> 'id')::uuid;
  perform pg_temp.sas_ok('look keeps only flat short scalars', r = '{"hat": "crown", "shirtColor": "#ff00aa"}'::jsonb
    and public.sas_clean_look('{"a":{"b":1},"c":[1],"ok":"x","long":"0123456789012345678901234567890123456789X"}') = '{"ok": "x"}'::jsonb, r::text);

  -- 38-39 names: words, not substrings (mirror of src/core/names.js)
  select string_agg(x, ', ') into v_t
    from unnest(array['Killian', 'Ana Lopez', 'Grape', 'Peacock', 'Essex', 'Nazir', 'Cassandra', 'Dickens', 'Hancock',
                      'Scunthorpe', 'Sussex', 'Analise', 'José', 'Zoë', '李明', 'Мария']) x
   where public.sas_clean_name(x, 'Player') is distinct from normalize(x, NFKC);
  perform pg_temp.sas_ok('real names are kept (Killian, Grape, Essex, Scunthorpe, 李明...)', v_t is null, coalesce('changed: ' || v_t, 'all kept'));
  select string_agg(x, ', ') into v_t
    from unnest(array['fuck', 'f u c k', 'f.u.c.k', 'fück', 'fuсk', 'motherfucker', 'bullshit', 'b1tch', 'a55', 'n1gger',
                      'k.i.l.l', 'Killer', 'Nazis', 'Sexy', 'dickhead', 'r4pe']) x
   where public.sas_clean_name(x, 'Player') <> 'Player';
  perform pg_temp.sas_ok('rude names (spaced, leet, accented, look-alike letters) become Player', v_t is null, coalesce('kept: ' || v_t, 'all refused'));

  -- 40 a look that is too big is dropped, never an error (32 fields of 40 two-byte letters, ~3.5 KB)
  update public.sas_players p set last_write_at = null where p.id = (a ->> 'id')::uuid;
  r := pg_temp.sas_anon($q$ select public.sas_register('Test Big Look', 'micah',
         (select jsonb_object_agg(lpad(i::text, 24, 'k'), repeat('é', 40)) from generate_series(1, 32) i)) $q$);
  d := pg_temp.sas_anon(format($q$ select public.sas_save(%L, %L, '{"v":4}', null,
         (select jsonb_object_agg(lpad(i::text, 24, 'k'), repeat('é', 40)) from generate_series(1, 32) i)) $q$, a ->> 'id', a ->> 'secret'));
  if (r ->> 'ok')::boolean then
    v_ids := v_ids || (r -> 'v' ->> 'id')::uuid;
  end if;
  select p.look into c from public.sas_players p where p.id = (r -> 'v' ->> 'id')::uuid;
  select p.look into b from public.sas_players p where p.id = (a ->> 'id')::uuid;
  perform pg_temp.sas_ok('an oversized look is dropped, not an error (register + save)',
    (r ->> 'ok')::boolean and c = '{}'::jsonb and (d ->> 'ok')::boolean and b = '{"hat": "crown", "shirtColor": "#ff00aa"}'::jsonb,
    coalesce(r ->> 'err', '') || coalesce(d ->> 'err', '') || ' look=' || coalesce(c::text, 'null'));

  -- 41 cleanup
  delete from public.sas_players p where p.id = any (v_ids);
  delete from public.sas_guard g where g.key = any (v_ipkeys) or g.key in ('reg:*', 'load:*');
  insert into public.sas_guard select * from jsonb_populate_recordset(null::public.sas_guard, v_guard);
  select count(*) into v_n from public.sas_players p where p.id = any (v_ids);
  perform pg_temp.sas_ok('test rows cleaned up', v_n = 0, v_n || ' left');

  select count(*) into v_n from sas_test_results t where not t.pass;
  perform pg_temp.sas_ok('all checks passed', v_n = 0, v_n || ' failed');
end;
$$;

select n, "check", pass, detail from sas_test_results order by n;
