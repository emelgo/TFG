-- Initialize schema and extensions
create schema if not exists cms;

-- Grant usage on the cms schema to the authenticated role
grant usage on schema cms to authenticated;

-- We remove all default privileges from public schema on functions to
--   prevent public access to them by default
alter default privileges in schema cms
revoke
execute on functions
from
  anon,
  authenticated;

-- revoke ALL on future tables/sequences too
alter default privileges in SCHEMA cms
revoke all on TABLES
from
  anon,
  authenticated,
  public;

alter default privileges in SCHEMA cms
revoke all on SEQUENCES
from
  anon,
  authenticated,
  public;