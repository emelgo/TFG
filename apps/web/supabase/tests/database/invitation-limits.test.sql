BEGIN;

select no_plan();

-- ----------------------------------------------------------------------------
-- Anti-abuse limits enforced by public.add_invitations_to_account:
--   * rate limit: at most 20 invitations may be CREATED per account within a
--     rolling 60-minute window; and
--   * quota: at most 50 OUTSTANDING (non-expired) invitations may exist per
--     account.
-- Both are enforced inside the service_role RPC (the only path that can create
-- invitations) so an authorized member cannot bypass them via the data API.
-- ----------------------------------------------------------------------------

select tests.create_supabase_user('inv_owner', 'inv_owner@test.com');

-- create the team account as service_role (the RPC is granted to service_role);
-- do NOT authenticate first or the new-account trigger would create a duplicate
-- owner membership.
set local role service_role;

select public.create_team_account(
    'Invite Limits Test',
    tests.get_supabase_uid('inv_owner'),
    'invite-limits-test'
);

set local role postgres;

-- ----------------------------------------------------------------------------
-- Rate limit: a single window allows up to 20 created invitations.
-- ----------------------------------------------------------------------------

set local role service_role;

-- exactly 20 in one batch is allowed (20 is not over the limit). This also
-- proves the DB function does not itself cap batch size (the batch cap of 5 is
-- an app-layer Zod concern) — the window-based limit is what protects the DB.
select lives_ok(
    $$ select public.add_invitations_to_account(
        'invite-limits-test',
        (select array_agg(row('rl' || g || '@test.com', 'member')::public.invitation)
           from generate_series(1, 20) g),
        tests.get_supabase_uid('inv_owner')
    ) $$,
    'creating 20 invitations in one window is allowed'
);

set local role postgres;

select is(
    (select count(*)::int from public.invitations
       where account_id = pymekit.get_account_id_by_slug('invite-limits-test')),
    20,
    '20 invitations were created by the batch RPC'
);

set local role service_role;

-- the 21st invitation in the same window is blocked
select throws_ok(
    $$ select public.add_invitations_to_account(
        'invite-limits-test',
        array[row('rl21@test.com', 'member')::public.invitation],
        tests.get_supabase_uid('inv_owner')
    ) $$,
    'Invitation rate limit reached. Please try again later.',
    'the 21st invitation created within the window is rejected'
);

set local role postgres;

-- the blocked call created nothing
select is(
    (select count(*)::int from public.invitations
       where account_id = pymekit.get_account_id_by_slug('invite-limits-test')),
    20,
    'the rate-limited call did not create any invitation'
);

-- reset for the quota phase
delete from public.invitations
where account_id = pymekit.get_account_id_by_slug('invite-limits-test');

-- ----------------------------------------------------------------------------
-- Quota: at most 50 outstanding (non-expired) invitations per account.
-- created_at is forced to now() by the timestamps trigger, so we disable it
-- while seeding aged rows. Aging the rows past the 60-minute window keeps this
-- phase testing the quota in isolation from the rate limit.
-- ----------------------------------------------------------------------------

alter table public.invitations disable trigger invitations_set_timestamps;

insert into public.invitations (email, invited_by, account_id, role, invite_token, created_at, expires_at)
select
    'q' || g || '@test.com',
    tests.get_supabase_uid('inv_owner'),
    pymekit.get_account_id_by_slug('invite-limits-test'),
    'member',
    gen_random_uuid(),
    now() - interval '2 hours',
    now() + interval '7 days'
from generate_series(1, 49) g;

alter table public.invitations enable trigger invitations_set_timestamps;

set local role service_role;

-- 49 pending + 1 new = 50 outstanding: exactly at the cap, still allowed
select lives_ok(
    $$ select public.add_invitations_to_account(
        'invite-limits-test',
        array[row('q50@test.com', 'member')::public.invitation],
        tests.get_supabase_uid('inv_owner')
    ) $$,
    'reaching exactly 50 outstanding invitations is allowed'
);

-- 50 pending + 1 new = 51 outstanding: over the cap, rejected
select throws_ok(
    $$ select public.add_invitations_to_account(
        'invite-limits-test',
        array[row('q51@test.com', 'member')::public.invitation],
        tests.get_supabase_uid('inv_owner')
    ) $$,
    'Account has reached the maximum number of pending invitations',
    'the 51st outstanding invitation is rejected by the quota'
);

set local role postgres;

select is(
    (select count(*)::int from public.invitations
       where account_id = pymekit.get_account_id_by_slug('invite-limits-test')),
    50,
    'the quota-blocked call did not create any invitation'
);

-- ----------------------------------------------------------------------------
-- Expired invitations do NOT count toward the quota: they free up capacity.
-- ----------------------------------------------------------------------------

delete from public.invitations
where account_id = pymekit.get_account_id_by_slug('invite-limits-test');

alter table public.invitations disable trigger invitations_set_timestamps;

-- created two days ago and expired yesterday: consistent with the
-- invitations_expires_after_created constraint while still expired
insert into public.invitations (email, invited_by, account_id, role, invite_token, created_at, expires_at)
select
    'exp' || g || '@test.com',
    tests.get_supabase_uid('inv_owner'),
    pymekit.get_account_id_by_slug('invite-limits-test'),
    'member',
    gen_random_uuid(),
    now() - interval '2 days',
    now() - interval '1 day'
from generate_series(1, 50) g;

alter table public.invitations enable trigger invitations_set_timestamps;

set local role service_role;

-- 50 expired invitations count as 0 outstanding, so a new one is allowed
select lives_ok(
    $$ select public.add_invitations_to_account(
        'invite-limits-test',
        array[row('fresh@test.com', 'member')::public.invitation],
        tests.get_supabase_uid('inv_owner')
    ) $$,
    'expired invitations do not count toward the quota'
);

set local role postgres;

select * from finish();

rollback;
