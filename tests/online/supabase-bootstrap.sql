-- Test-only: make a plain local Postgres look like a Supabase project for the parts the migration relies
-- on (API roles and the default grants Supabase gives them in `public`), so tests/online/pg.mjs can apply
-- supabase/migrations/0001_steal_a_seed.sql and check that the revokes/grants really hold.
-- NOT for the real project (Supabase already has all of this).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator noinherit login; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase's (current) defaults: everything new in public is reachable by the API roles
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
