import { Page, expect, test } from '@playwright/test';

import { InvitationsPageObject } from '../invitations/invitations.po';
import { TeamAccountsPageObject } from './team-accounts.po';

// Helper function to set up a team with a member
async function setupTeamWithMember(page: Page, memberRole = 'member') {
  // Setup invitations page object
  const invitations = new InvitationsPageObject(page);
  const teamAccounts = invitations.teamAccounts;

  // Setup team with owner
  const { email: ownerEmail, slug } = await invitations.setup();

  // Navigate to members page
  await invitations.navigateToMembers();

  // Create a new member email and invite them with the specified role
  const memberEmail = invitations.auth.createRandomEmail();

  const invites = [
    {
      email: memberEmail,
      role: memberRole,
    },
  ];

  await invitations.openInviteForm();
  await invitations.inviteMembers(invites);

  // Verify the invitation was sent
  await expect(invitations.getInvitations()).toHaveCount(1);

  // Sign out the current user
  await page.context().clearCookies();

  // Sign up with the new member email and accept the invitation
  await invitations.auth.visitConfirmEmailLink(memberEmail);

  await invitations.acceptInvitation();

  await invitations.teamAccounts.openAccountsSelector();

  await expect(invitations.teamAccounts.getTeams()).toHaveCount(1);

  // Sign out and sign back in as the original owner
  await page.context().clearCookies();

  await page.goto('/auth/sign-in');

  await invitations.auth.loginAsUser({
    email: ownerEmail,
    next: '/dashboard',
  });

  // The active account persists in the DB, so the owner reopens on the team
  // they created; the members page is reachable at the slug-free settings path.
  await page.goto(`/settings/members`);

  return { invitations, teamAccounts, ownerEmail, memberEmail, slug };
}

test.describe('Team Accounts', () => {
  test.beforeEach(async ({ page }) => {
    const teamAccounts = new TeamAccountsPageObject(page);
    await teamAccounts.setup();
  });

  test('user can update their team name', async ({ page }) => {
    const teamAccounts = new TeamAccountsPageObject(page);
    const newTeamName = `Updated-Team-${(Math.random() * 100000000).toFixed(0)}`;

    await teamAccounts.goToSettings();

    // Update just the name (slug stays the same for Latin names)
    await teamAccounts.updateTeamName(newTeamName);

    await page.goto('/dashboard');

    await teamAccounts.openAccountsSelector();

    await expect(teamAccounts.getTeamFromSelector(newTeamName)).toBeVisible();
  });

  test('cannot create a Team account using reserved names', async ({
    page,
  }) => {
    const teamAccounts = new TeamAccountsPageObject(page);
    await teamAccounts.createTeam();

    await teamAccounts.openAccountsSelector();
    await page.click('[data-testid="create-team-trigger"]');

    await teamAccounts.tryCreateTeam('billing');

    await expect(
      page.getByText('This name is reserved. Please choose a different one.'),
    ).toBeVisible();

    await teamAccounts.tryCreateTeam('settings');

    await expect(
      page.getByText('This name is reserved. Please choose a different one.'),
    ).toBeVisible();

    function expectError() {
      return expect(
        page.getByText(
          'This name cannot contain special characters. Please choose a different one.',
        ),
      ).toBeVisible();
    }

    await teamAccounts.tryCreateTeam('Test-Name#');
    await expectError();

    await teamAccounts.tryCreateTeam('Test,Name');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name/');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name\\');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name:');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name;');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name=');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name>');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name<');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name?');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name@');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name^');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name&');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name*');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name(');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name)');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name+');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name%');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name$');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name[');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name]');
    await expectError();
  });

  test('can create a Team account with non-Latin name when providing a slug', async ({
    page,
  }) => {
    const teamAccounts = new TeamAccountsPageObject(page);
    await teamAccounts.createTeam();

    const random = (Math.random() * 100000000).toFixed(0);
    const slug = `korean-team-${random}`;

    // Create team with Korean name
    await teamAccounts.createTeamWithNonLatinName('한국 팀', slug);

    // Verify we're on the team page
    await expect(page).toHaveURL(`/dashboard`);

    // Verify team appears in selector
    await teamAccounts.openAccountsSelector();
    await expect(teamAccounts.getTeamFromSelector('한국 팀')).toBeVisible();
  });

  test('slug validation shows error for invalid characters', async ({
    page,
  }) => {
    const teamAccounts = new TeamAccountsPageObject(page);
    await teamAccounts.createTeam();

    // Use non-Latin name to trigger the slug field visibility
    await teamAccounts.openAccountsSelector();
    await page.click('[data-testid="create-team-trigger"]');

    await page.fill(
      '[data-testid="create-team-form"] [data-testid="team-name-input"]',
      'テストチーム',
    );

    // Wait for slug field to appear (triggered by non-Latin name)
    await expect(teamAccounts.getSlugField()).toBeVisible();

    // Test invalid slug with uppercase
    await page.fill(
      '[data-testid="create-team-form"] [data-testid="team-slug-input"]',
      'Invalid-Slug',
    );

    await page.click('[data-testid="create-team-form"] button:last-child');

    await expect(
      page.getByText(
        'Only English letters (a-z), numbers (0-9), and hyphens (-) are allowed',
        { exact: true },
      ),
    ).toBeVisible();

    // Test invalid slug with non-Latin characters
    await page.fill(
      '[data-testid="create-team-form"] [data-testid="team-slug-input"]',
      'тест-slug',
    );

    await page.click('[data-testid="create-team-form"] button:last-child');

    await expect(
      page.getByText(
        'Only English letters (a-z), numbers (0-9), and hyphens (-) are allowed',
        { exact: true },
      ),
    ).toBeVisible();
  });
});

test.describe('Team Account Deletion', () => {
  test('user can delete their team account', async ({ page }) => {
    const teamAccounts = new TeamAccountsPageObject(page);
    const params = teamAccounts.createTeamName();

    const { email } = await teamAccounts.setup(params);
    await teamAccounts.goToSettings();

    await teamAccounts.deleteAccount(email);
    await teamAccounts.openAccountsSelector();

    await expect(
      teamAccounts.getTeamFromSelector(params.teamName),
    ).not.toBeVisible();
  });
});

test.describe('Team Member Role Management', () => {
  test("owner can update a team member's role", async ({ page }) => {
    // Setup team with a regular member
    const { teamAccounts, memberEmail } = await setupTeamWithMember(page);

    // Get the current role badge text
    const memberRow = page.getByRole('row', { name: memberEmail });

    const initialRoleBadge = memberRow.locator(
      '[data-testid="member-role-badge"]',
    );

    await expect(initialRoleBadge).toHaveText('Member');

    // Update the member's role to admin
    await teamAccounts.updateMemberRole(memberEmail, 'owner');

    await expect(
      page
        .getByRole('row', { name: memberEmail })
        .locator('[data-testid="member-role-badge"]'),
    ).toHaveText('Owner');
  });
});

test.describe('Team Ownership Transfer', () => {
  test('owner can transfer ownership to another team member', async ({
    page,
  }) => {
    // Setup team with an owner member (required for ownership transfer)
    const { teamAccounts, ownerEmail, memberEmail } = await setupTeamWithMember(
      page,
      'owner',
    );

    // Transfer ownership to the member
    await teamAccounts.transferOwnership(memberEmail, ownerEmail);

    // Verify the transfer was successful by checking if the primary owner badge
    // is now on the new owner's row
    const memberRow = page.getByRole('row', { name: memberEmail });

    // Check for the primary owner badge on the member's row
    await expect(memberRow.locator('text=Primary Owner')).toBeVisible();

    // The original owner should no longer have the primary owner badge
    const ownerRow = page.getByRole('row', { name: ownerEmail.split('@')[0] });
    await expect(ownerRow.locator('text=Primary Owner')).not.toBeVisible();
  });
});

test.describe('Team Account Security', () => {
  test('unauthorized user cannot access team account', async ({
    page,
    browser,
  }) => {
    // 1. Create a team account with User A
    const teamAccounts = new TeamAccountsPageObject(page);
    const params = teamAccounts.createTeamName();

    // Setup User A and create team
    await teamAccounts.setup(params);

    // 2. Sign out User A
    await page.context().clearCookies();

    // 3. Create a new context for User B (to have clean cookies/session)
    const userBContext = await browser.newContext();
    const userBPage = await userBContext.newPage();
    const userBTeamAccounts = new TeamAccountsPageObject(userBPage);

    // Sign up with User B
    await userBPage.goto('/auth/sign-up');
    const emailB = userBTeamAccounts.auth.createRandomEmail();

    await userBTeamAccounts.auth.signUp({
      email: emailB,
      password: 'password',
      repeatPassword: 'password',
    });

    await userBTeamAccounts.auth.visitConfirmEmailLink(emailB);

    // 4. User B lands on their own (personal) workspace — never Team A.
    await userBPage.goto(`/dashboard`);
    await expect(userBPage).toHaveURL(`/dashboard`);

    // Team A must be invisible to User B: not a member, so it must not appear
    // in the workspace switcher (the only way to reach another account now that
    // there is no account slug in the URL).
    await userBTeamAccounts.openAccountsSelector();

    await expect(
      userBTeamAccounts.getTeamFromSelector(params.teamName),
    ).toHaveCount(0);
  });
});
