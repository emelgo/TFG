BEGIN;

select no_plan();

-- Create test users for different scenarios
select tests.create_supabase_user('transitioning_admin');
select tests.create_supabase_user('revoking_mfa_admin');
select tests.create_supabase_user('concurrent_session_user');

-- Set up test users
select pymekit.set_identifier('transitioning_admin', 'transitioning@pymekit.test');
select pymekit.set_identifier('revoking_mfa_admin', 'revoking@pymekit.test');
select pymekit.set_identifier('concurrent_session_user', 'concurrent@pymekit.test');

-- Test 1: Role Transition Scenarios
select pymekit.authenticate_as('transitioning_admin');
select pymekit.set_mfa_factor();
select pymekit.set_session_aal('aal2');

-- Initially not a super admin
select is(
    (select public.is_super_admin()),
    false,
    'User should not be super admin initially'
);

-- Grant super admin
select pymekit.set_super_admin();

select is(
    (select public.is_super_admin()),
    true,
    'User should now be super admin'
);

-- Test 2: MFA Revocation Scenarios
select pymekit.authenticate_as('revoking_mfa_admin');
select pymekit.set_mfa_factor();
select pymekit.set_session_aal('aal2');
select pymekit.set_super_admin();

-- Initially has super admin access
select is(
    (select public.is_super_admin()),
    true,
    'Admin should have super admin access initially'
);

-- Simulate MFA revocation by setting AAL1
select pymekit.set_session_aal('aal1');

select is(
    (select public.is_super_admin()),
    false,
    'Admin should lose super admin access when MFA is revoked'
);

-- Test 3: Concurrent Session Management
select pymekit.authenticate_as('concurrent_session_user');
select pymekit.set_mfa_factor();
select pymekit.set_session_aal('aal2');
select pymekit.set_super_admin();

-- Test access with AAL2
select is(
    (select public.is_super_admin()),
    true,
    'Should have super admin access with AAL2'
);

-- Simulate different session with AAL1
select pymekit.set_session_aal('aal1');

select is(
    (select public.is_super_admin()),
    false,
    'Should not have super admin access with AAL1 even if other session has AAL2'
);

-- Finish the tests and clean up
select * from finish();

rollback;