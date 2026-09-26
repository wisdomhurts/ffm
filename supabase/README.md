# Supabase backend: cloud saves + high scores

Everything the game stores online lives in one migration:
[`migrations/0001_steal_a_seed.sql`](migrations/0001_steal_a_seed.sql). No Edge Functions, no Auth, no
extensions (it only uses core `gen_random_uuid()` and `sha256()`). Realtime rooms (multiplayer) are
separate and need no tables.

## Apply it

1. Apply the migration once, as `postgres`:
   * Supabase MCP: `apply_migration` with name `0001_steal_a_seed` and the file's contents, or
   * Dashboard: SQL editor, paste the file, Run.

   It is safe to run again (`if not exists` / `create or replace`).
2. Check it: run [`tests.sql`](tests.sql) as one script (MCP `execute_sql` or the SQL editor). It calls
   the RPCs as `anon`, cleans up after itself and ends with one table. **Expected: 42 rows, all
   `pass = true`** (the header of the file lists every row and its expected detail).
3. Put the project URL and the **publishable** key (`sb_publishable_...`, or the legacy anon key) in
   `src/online/config.js` (`SUPABASE_URL`, `SUPABASE_KEY`). Both are public by design.
4. Optional: run `get_advisors` (security). These are expected, by design (see below):
   * three INFO notices "RLS enabled, no policy" on `sas_players`, `sas_scores`, `sas_guard`;
   * WARN "Public / Signed-in users can execute SECURITY DEFINER function" for the 8 RPCs in the table
     below (and only those 8): they are the game's API. Each checks its inputs, the write RPCs need the
     player's secret, and lookups and sign-ups are rate limited. The 14 helpers are not executable.

## Tables (public, RLS on, no policies, no grants to anon/authenticated)

| table | what |
|---|---|
| `sas_players` | one row per save code: `id`, `secret_hash` + `secret_salt` (SHA-256), `save_code` (unique, `SEED-XXXX-XXXX`), `name`, `base`, `look`, `save` jsonb (<= 200 KB), `listed`, `banned`, counters, timestamps, `last_write_at` (rate limit) |
| `sas_scores` | best value per `(player_id, board)`, plus `week_value`/`week_start` for the weekly board; `name`/`base`/`look` copied for fast reads; `hidden` = not listed or banned. Indexes: `(board, value desc, updated_at)` and `(board, week_start, week_value desc, week_at)`, both `where not hidden` |
| `sas_guard` | fixed-window abuse counters keyed by a hash of the caller's IP (raw IPs are never stored) |

## RPCs (POST `/rest/v1/rpc/<name>` with `apikey` + `Authorization: Bearer <publishable key>`)

All are `SECURITY DEFINER`, `set search_path = ''`, fully qualified. Errors come back as PostgREST errors
whose `message` is a short token; HTTP status is set with `PTxxx` SQLSTATEs.

| RPC | args | returns | notes |
|---|---|---|---|
| `sas_register` | `p_name, p_base, p_look?` | `{id, secret, code}` | new cloud player. 20 per IP per hour (3000/h overall) |
| `sas_save` | `p_id, p_secret, p_save, p_name?, p_look?` | `{ok, saved_at}` | stores the save (JSON object <= 200 KB). 1 per 5 s per player |
| `sas_peek` | `p_code` | `{name, base, look, summary, has_save, saved_at}` or `null` | preview before loading; no secret, no save |
| `sas_load` | `p_code` | `{id, secret, code, name, base, look, save, saved_at}` or `null` | moves the save to the caller: issues a **new secret** (the previous device gets `bad_secret` from then on) |
| `sas_submit` | `p_id, p_secret, p_board, p_value, p_name?, p_look?` | `{board, best, week}` | keeps the best, all time and for the current UTC week. 1 per 5 s per board |
| `sas_top` | `p_board, p_limit=50, p_period='all'|'week', p_me?` | rows `rank, name, base, look, value, updated_at, me` | top N (1-100). `p_me` = your player id: flags your row and appends it with its real rank if you're outside the top N. Ties share a rank. `STABLE` |
| `sas_listed` | `p_id, p_secret, p_listed` | `{listed}` | show/hide me on the boards (scores kept) |
| `sas_delete` | `p_id, p_secret` | `true` | deletes the player, the code and all scores |

Boards: `networth` (cap 1e18), `showdown` (1e15), `steals` (integer, 1e7), `rebirths` (integer, 1e3).
Values must be finite and `>= 0`.

Error tokens: `bad_secret` (403), `rate_limited` (429), `too_big` (413), `bad_code`, `bad_board`,
`bad_value`, `bad_save`, `bad_base`, `bad_period` (400).

Not exposed (run from the SQL editor):
* `select public.sas_ban('SEED-XXXX-XXXX', true);` hides a player from every board and blocks their writes
  (`false` undoes it).
* `select public.sas_prune();` removes players that never saved or scored after 30 days and old guard
  rows. Schedule it weekly with pg_cron if you like: `select cron.schedule('sas-prune', '17 4 * * 1', 'select public.sas_prune()');`

## Security notes

* **No direct table access.** RLS is enabled with no policies and `anon`/`authenticated`/`PUBLIC` have
  no table privileges, so the Data API can't read or write rows even if a grant slips in later. Helper
  functions (`sas_auth`, `sas_rand`, `sas_clean_name`, ...) are not executable by API roles; only the 8
  RPCs above are.
* **Credentials.** A player is `(id, secret)`. The secret is 256 random bits returned once (and again by
  `sas_load`), stored only as `sha256(salt || secret)` with a per-row random salt. The game keeps it in
  the profile on the device and never shows it.
* **The save code is the moving credential.** Anyone with the code can load that save (that's the
  feature), so the game tells players to share it only with family. Codes have 40 random bits
  (32-letter alphabet without 0/O/1/I). Unknown-code lookups are limited to 20 per IP per 10 minutes
  and 1000 per 10 minutes overall, which makes guessing codes impractical. Loading rotates the secret,
  so only one device writes to a save at a time and nothing is overwritten silently.
* **Validation server-side:** board whitelist; values finite, non-negative, integers where needed and
  capped; `look` reduced to <= 32 flat, short scalar fields and dropped when over 2048 bytes (the same
  cap as the columns, so a look can never make a call fail); saves must be JSON objects <= 200 KB.
* **Names** (`sas_clean_name` + `sas_name_ok`, an exact mirror of `src/core/names.js`): after NFKC,
  1-14 characters of letters of any script, digits, space and `_ . ' -` (combining accents only right
  after a letter, at most two; no invisible, symbol, emoji or private-use characters). The word filter
  works on words, not substrings: the name is folded to a-z (accents dropped, look-alike Cyrillic/Greek
  letters and leetspeak mapped) and split into words; strong words (slurs, hard swearing) are blocked at
  the start or end of a word, milder ones (kill, sex, nazi...) only as a whole word with simple endings,
  and runs of 1-2 letter words are checked glued together ("f u c k"). So Killian, Grape, Essex,
  Scunthorpe, "Ana Lopez", José, 李明 and Мария are fine. Letters of other scripts can't be filtered and
  are accepted. A refused name becomes `Player` on sign-up and keeps the old name later.
  `tests/online/names.test.mjs` fails if the word lists in the SQL and in `names.js` ever differ.
* **Rate limits:** saves 1 per 5 s per player, scores 1 per 5 s per board, sign-ups per IP. The caller
  IP comes from `cf-connecting-ip`, then `x-real-ip`, then the first `x-forwarded-for` entry (only its
  hash is stored). A spoofed `x-forwarded-for` can dodge the per-IP limit but not the global ones.
* **Privacy:** no photos ever reach the server (the client strips any image data from saves); boards
  show a name, a colour and a number. Players can hide themselves (`sas_listed`) or delete everything
  (`sas_delete`) from the Cloud Save panel.
* Scores are self-reported by the game client; the caps and rate limits keep them sane, and `sas_ban`
  handles the rest.

## Local testing (no Supabase needed)

* `node --test tests/online/online.test.mjs tests/online/names.test.mjs`: the client against an in-memory
  fake of these RPCs, and the name filter (including a check that the SQL word lists match `names.js`).
* The same tests against the real SQL in a local Postgres (15+): apply
  `tests/online/supabase-bootstrap.sql` (fake Supabase roles and default grants) and the migration, then
  `SAS_PG="host=... port=... dbname=... user=postgres" node --test tests/online/online.test.mjs tests/online/names.test.mjs`
  (the names test then also checks that SQL and JS decide identically on ~180 names)
  (`tests/online/pg-backend.mjs` runs every request through `psql` as `anon`, one transaction each,
  like PostgREST). `psql -f supabase/tests.sql` works there too.
