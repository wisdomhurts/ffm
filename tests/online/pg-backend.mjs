// Test-only: a PostgREST-shaped fetch that runs the real RPCs of supabase/migrations in a local Postgres
// through `psql`, as the `anon` role, one transaction per request (like PostgREST). Lets
// tests/online/online.test.mjs exercise the client against the actual SQL:
//
//   SAS_PG="host=/path/to/socket port=55432 dbname=sas_t user=postgres" node --test tests/online/
//
// The database must already have tests/online/supabase-bootstrap.sql + the migration applied.
import { execFileSync, spawnSync } from 'node:child_process';

export const PG_URL = 'https://local-pg.supabase.test';
export const PG_KEY = 'sb_publishable_local_pg';

function psql(conn, script, vars = {}) {
  const args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-d', conn];
  for (const [k, v] of Object.entries(vars)) args.push('-v', `${k}=${v}`);
  const r = spawnSync('psql', args, { input: script, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: r.stderr || '' };
}

// PostgREST's SQLSTATE -> HTTP status (the parts we can hit)
function httpStatus(state) {
  if (/^PT\d{3}$/.test(state)) return +state.slice(2);
  if (state === '42501') return 401;
  if (state === '42883') return 404;
  if (state === '23505' || state === '23503') return 409;
  if (/^(08|53)/.test(state)) return 503;
  if (/^(09|25|2D|38|39|3B|40|54|55|57|58|F0|HV|P0|XX)/.test(state) && state !== 'P0001') return 500;
  return 400;
}

export function createPgBackend(conn = process.env.SAS_PG) {
  const state = { mode: 'up', calls: [] };
  // argument names/types of every sas_ RPC
  const sig = {};
  const meta = psql(conn, `select p.proname || '|' || p.proretset || '|' || coalesce(array_to_string(p.proargnames, ','), '') || '|' ||
      coalesce((select string_agg(format_type(t, null), ',' order by o) from unnest(p.proargtypes) with ordinality u(t, o)), '')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'sas\\_%';`);
  if (!meta.ok) throw new Error('psql failed: ' + meta.err);
  for (const line of meta.out.split('\n').filter(Boolean)) {
    const [name, set, names, types] = line.split('|');
    const n = names ? names.split(',') : [];
    const t = types ? types.split(',') : [];
    sig[name] = { set: set === 't' || set === 'true', args: Object.fromEntries(n.slice(0, t.length).map((x, i) => [x, t[i]])) };
  }
  const expr = (k, t) => {
    const j = `(:'body'::jsonb -> '${k}')`;
    if (t === 'jsonb') return j;
    if (t === 'text') return `(:'body'::jsonb ->> '${k}')`;
    return `(:'body'::jsonb ->> '${k}')::${t}`;
  };

  function handle(url, { headers = {}, body = '{}' } = {}) {
    const m = String(url).match(/\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (!String(url).startsWith(PG_URL) || !m) throw new TypeError('Failed to fetch');
    const fn = m[1];
    const args = JSON.parse(body || '{}');
    state.calls.push({ fn, args });
    if (state.mode === 'down') throw new TypeError('Failed to fetch');
    if (state.mode === '500') return { status: 503, body: JSON.stringify({ message: 'upstream unavailable' }) };
    const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    if (h.apikey !== PG_KEY || h.authorization !== 'Bearer ' + PG_KEY) return { status: 401, body: '{"message":"Invalid API key"}' };
    const s = sig[fn];
    if (!s) return { status: 404, body: JSON.stringify({ code: 'PGRST202', message: `Could not find the function public.${fn}` }) };
    const call = `public.${fn}(${Object.keys(args).filter((k) => k in s.args).map((k) => `${k} => ${expr(k, s.args[k])}`).join(', ')})`;
    const sql = s.set ? `select coalesce(json_agg(t), '[]'::json) from ${call} t;` : `select to_json(${call});`;
    const script = `begin;\nselect set_config('request.headers', :'hdr', true) \\g /dev/null\nset local role anon;\n${sql}\ncommit;\n`;
    const r = psql(conn, script, { body: JSON.stringify(args), hdr: JSON.stringify({ 'x-forwarded-for': '198.51.100.23' }) });
    if (r.ok) return { status: 200, body: r.out === '' ? 'null' : r.out };
    const em = r.err.match(/ERROR:\s+([0-9A-Z]{5}):\s+(.*)/);
    const hint = (r.err.match(/HINT:\s+(.*)/) || [])[1] || null;
    if (!em) return { status: 500, body: JSON.stringify({ message: r.err.trim() }) };
    return { status: httpStatus(em[1]), body: JSON.stringify({ code: em[1], message: em[2].trim(), hint, details: null }) };
  }

  return {
    url: PG_URL,
    key: PG_KEY,
    state,
    handle,
    async fetch(input, init = {}) {
      const r = handle(typeof input === 'string' ? input : input.url, { headers: init.headers || {}, body: init.body });
      return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json' } });
    },
    clearRateLimits() {
      psql(conn, `update public.sas_players set last_write_at = null; update public.sas_scores set submitted_at = now() - interval '1 minute'; delete from public.sas_guard;`);
    },
    stored(id) {
      const r = psql(conn, `select save from public.sas_players where id = :'id';`, { id });
      return r.out ? JSON.parse(r.out) : null;
    },
    reset() {
      execFileSync('psql', ['-X', '-q', '-d', conn, '-c', 'truncate public.sas_scores, public.sas_players, public.sas_guard cascade']);
    },
  };
}
