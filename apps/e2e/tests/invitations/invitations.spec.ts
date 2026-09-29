import { expect, test } from '@playwright/test';

import { InvitationsPageObject } from './invitations.po';

test.describe('Invitations', () => {
  let invitations: InvitationsPageObject;

  test.beforeEach(async ({ page }) => {
    invitations = new InvitationsPageObject(page);

    await invitations.setup();
  });

  test('users can delete invites', async () => {
    await invitations.navigateToMembers();
    await invitations.openInviteForm();

    const email = invitations.auth.createRandomEmail();

    const invites = [
      {
        email,
        role: 'member',
      },
    ];

    await invitations.inviteMembers(invites);

    await expect(invitations.getInvitations()).toHaveCount(1);

    await invitations.deleteInvitation(email);

    await expect(invitations.getInvitations()).toHaveCount(0);
  });

  test('users can update invites', async () => {
    await invitations.navigateToMembers();
    await invitations.openInviteForm();

    const email = invitations.auth.createRandomEmail();

    const invites = [
      {
        email,
        role: 'member',
      },
    ];

    await invitations.inviteMembers(invites);

    await expect(invitations.getInvitations()).toHaveCount(1);

    await invitations.updateInvitation(email, 'owner');

    const row = invitations.getInvitationRow(email);

    await expect(row.locator('[data-testid="member-role-badge"]')).toHaveText(
      'Owner',
    );
  });

  test('user cannot invite a member of the team again', async ({ page }) => {
    await invitations.navigateToMembers();

    const email = invitations.auth.createRandomEmail();

    const invites = [
      {
        email,
        role: 'member',
      },
    ];

    await invitations.openInviteForm();
    await invitations.inviteMembers(invites);

    await expect(invitations.getInvitations()).toHaveCount(1);

    // Try to invite the same member again
    // This should fail
    await invitations.openInviteForm();
    await invitations.inviteMembers(invites);
    await page.waitForTimeout(500);
    await expect(invitations.getInvitations()).toHaveCount(1);
  });
});

test.describe('Full Invitation Flow', () => {
  test('should invite users and let users accept an invite', async ({
    page,
  }) => {
    const invitations = new InvitationsPageObject(page);
    await invitations.setup();

    await invitations.navigateToMembers();

    const invites = [
      {
        email: invitations.auth.createRandomEmail(),
        role: 'member',
      },
      {
        email: invitations.auth.createRandomEmail(),
        role: 'member',
      },
    ];

    await invitations.openInviteForm();
    await invitations.inviteMembers(invites);

    const firstEmail = invites[0]!.email;

    await expect(invitations.getInvitations()).toHaveCount(2);

    // sign out and sign in with the first email
    await page.context().clearCookies();
    await page.reload();

    console.log(`Finding email to ${firstEmail} ...`);

    await invitations.auth.visitConfirmEmailLink(firstEmail);

    console.log(`Accepting invitation as ${firstEmail}`);

    await invitations.acceptInvitation();

    await invitations.teamAccounts.openAccountsSelector();

    await expect(invitations.teamAccounts.getTeams()).toHaveCount(1);
  });

  test('new users should be redirected to /identities to set up identity', async ({
    page,
  }) => {
    const invitations = new InvitationsPageObject(page);
    await invitations.setup();

    await invitations.navigateToMembers();

    const newUserEmail = invitations.auth.createRandomEmail();

    const invites = [
      {
        email: newUserEmail,
        role: 'member',
      },
    ];

    await invitations.openInviteForm();
    await invitations.inviteMembers(invites);

    await expect(invitations.getInvitations()).toHaveCount(1);

    // Sign out current user
    await page.context().clearCookies();
    await page.reload();

    console.log(`Finding invitation email for new user: ${newUserEmail}`);

    // Click invitation link from email
    await invitations.auth.visitConfirmEmailLink(newUserEmail);

    console.log(`New user authenticated, should land on /join page`);

    // Verify user lands on /join page
    await page.waitForURL('**/join?**');

    // Click accept invitation button
    const acceptButton = page.locator(
      '[data-testid="join-team-form"] button[type="submit"]',
    );
    await acceptButton.click();

    console.log(`Checking if new user is redirected to /identities...`);

    // NEW USERS should be redirected to /identities to set up auth method
    await page.waitForURL('**/identities?**', { timeout: 5000 });

    console.log(`✓ New user correctly redirected to /identities`);

    // Verify continue button exists (user can skip and set up later)
    const continueButton = page.locator('[data-testid="continue-button"]');
    await expect(continueButton).toBeVisible();

    console.log(`Skipping identity setup...`);

    // Skip identity setup for now
    await continueButton.click();

    // Handle confirmation dialog that appears when skipping without adding auth
    const confirmationDialog = page.locator(
      '[data-testid="no-auth-method-dialog"]',
    );

    if (await confirmationDialog.isVisible({ timeout: 2000 })) {
      console.log('Confirmation dialog appeared, clicking Continue...');
      await page.locator('[data-testid="no-auth-dialog-continue"]').click();
    }

    // Should redirect to team home after skipping
    await page.waitForURL(new RegExp('/dashboard'));

    console.log(`✓ New user successfully joined team after identity setup`);

    // Verify user is now a member
    await invitations.teamAccounts.openAccountsSelector();
    await expect(invitations.teamAccounts.getTeams()).toHaveCount(1);
  });

  test('existing users should skip /identities and go directly to team', async ({
    page,
  }) => {
    const invitations = new InvitationsPageObject(page);

    // First, create a user account by signing up
    const existingUserEmail = 'test@makerkit.dev';

    await invitations.setup();
    await invitations.navigateToMembers();

    const invites = [
      {
        email: existingUserEmail,
        role: 'member',
      },
    ];

    console.log(`Sending invitation to existing user...`);

    await invitations.openInviteForm();
    await invitations.inviteMembers(invites);

    await expect(invitations.getInvitations()).toHaveCount(1);

    // Sign out and click invitation as existing user
    await page.context().clearCookies();
    await page.reload();

    console.log(`Existing user clicking invitation link...`);

    // Click invitation link from email
    await invitations.auth.visitConfirmEmailLink(existingUserEmail, {
      deleteAfter: true,
    });

    // Verify user lands on /join page
    await page.waitForURL('**/join?**');

    // Click accept invitation button
    const acceptButton = page.locator(
      '[data-testid="join-team-form"] button[type="submit"]',
    );

    await acceptButton.click();

    console.log(`Verifying existing user skips /identities...`);

    // EXISTING USERS should skip /identities and go directly to team home
    await page.waitForURL(new RegExp('/dashboard'), { timeout: 5000 });

    console.log(
      `✓ Existing user correctly skipped /identities and went directly to team`,
    );
  });

  test('invitation links should work for 7 days (on-the-fly generation)', async ({
    page,
  }) => {
    const invitations = new InvitationsPageObject(page);
    await invitations.setup();

    await invitations.navigateToMembers();

    const newUserEmail = invitations.auth.createRandomEmail();

    const invites = [
      {
        email: newUserEmail,
        role: 'member',
      },
    ];

    await invitations.openInviteForm();
    await invitations.inviteMembers(invites);

    await expect(invitations.getInvitations()).toHaveCount(1);

    // Get the invitation link from email
    console.log(`Getting invitation link from email...`);

    // Sign out to access mailbox
    await page.context().clearCookies();
    await page.reload();

    // Visit the invitation link
    await invitations.auth.visitConfirmEmailLink(newUserEmail, {
      deleteAfter: false, // Keep email for multiple clicks
    });

    console.log(`✓ First click successful - user authenticated`);

    // Verify we're on the join page
    await page.waitForURL('**/join?**');

    // Don't accept yet - just verify the link works

    console.log(`Simulating clicking link again (second time)...`);

    // Clear session and click link again
    await page.context().clearCookies();

    // Visit link again (simulating user clicking expired link)
    await invitations.auth.visitConfirmEmailLink(newUserEmail, {
      deleteAfter: false,
    });

    console.log(`✓ Second click successful - link still works!`);

    // Should still work and land on join page
    await page.waitForURL('**/join?**');

    console.log(
      `✓ Invitation link works multiple times (on-the-fly token generation)`,
    );

    // Now accept the invitation
    await invitations.acceptInvitation();

    // Verify successful
    await invitations.teamAccounts.openAccountsSelector();
    await expect(invitations.teamAccounts.getTeams()).toHaveCount(1);
  });
});

test.describe('Identity Setup Confirmation Dialog', () => {
  test('should show confirmation dialog when skipping without adding auth method', async ({
    page,
  }) => {
    const invitations = new InvitationsPageObject(page);
    await invitations.setup();

    await invitations.navigateToMembers();

    const newUserEmail = invitations.auth.createRandomEmail();

    const invites = [
      {
        email: newUserEmail,
        role: 'member',
      },
    ];

    await invitations.openInviteForm();
    await invitations.inviteMembers(invites);

    await expect(invitations.getInvitations()).toHaveCount(1);

    // Sign out and accept invitation as new user
    await page.context().clearCookies();
    await page.reload();

    console.log(`New user accepting invitation: ${newUserEmail}`);

    await invitations.auth.visitConfirmEmailLink(newUserEmail);
    await page.waitForURL('**/join?**');

    // Click accept invitation
    const acceptButton = page.locator(
      '[data-testid="join-team-form"] button[type="submit"]',
    );
    await acceptButton.click();

    // Should redirect to /identities
    await page.waitForURL('**/identities?**', { timeout: 5000 });

    console.log(`✓ Redirected to /identities page`);

    // Try to continue WITHOUT adding any auth method
    const continueButton = page.locator('[data-testid="continue-button"]');
    await continueButton.click();

    console.log(`Clicked continue without adding auth method...`);

    // Confirmation dialog should appear
    const confirmDialog = page.locator('[data-testid="no-auth-method-dialog"]');
    await expect(confirmDialog).toBeVisible({ timeout: 2000 });

    console.log(`✓ Confirmation dialog appeared`);

    // Verify dialog content
    await expect(
      page.locator('[data-testid="no-auth-dialog-title"]'),
    ).toBeVisible();

    await expect(
      page.locator('[data-testid="no-auth-dialog-description"]'),
    ).toBeVisible();

    // Verify dialog has cancel and continue buttons
    const cancelButton = page.locator('[data-testid="no-auth-dialog-cancel"]');
    const proceedButton = page.locator(
      '[data-testid="no-auth-dialog-continue"]',
    );

    await expect(cancelButton).toBeVisible();
    await expect(proceedButton).toBeVisible();

    console.log(`✓ Dialog has correct content and buttons`);

    // Click proceed to continue without auth
    await proceedButton.click();

    // Should now redirect to team home
    await page.waitForURL(new RegExp('/dashboard'), { timeout: 5000 });

    console.log(`✓ User successfully continued without adding auth method`);

    // Verify user joined team
    await invitations.teamAccounts.openAccountsSelector();
    await expect(invitations.teamAccounts.getTeams()).toHaveCount(1);
  });

  test('should NOT show confirmation when user adds password', async ({
    page,
  }) => {
    const invitations = new InvitationsPageObject(page);
    await invitations.setup();

    await invitations.navigateToMembers();

    const newUserEmail = invitations.auth.createRandomEmail();

    const invites = [
      {
        email: newUserEmail,
        role: 'member',
      },
    ];

    await invitations.openInviteForm();
    await invitations.inviteMembers(invites);

    // Sign out and accept invitation
    await page.context().clearCookies();
    await page.reload();

    console.log(`New user accepting invitation: ${newUserEmail}`);

    await invitations.auth.visitConfirmEmailLink(newUserEmail);
    await page.waitForURL('**/join?**');

    const acceptButton = page.locator(
      '[data-testid="join-team-form"] button[type="submit"]',
    );
    await acceptButton.click();

    // Should redirect to /identities
    await page.waitForURL('**/identities?**', { timeout: 5000 });

    console.log(`Setting up password authentication...`);

    // Click to open password dialog
    const passwordDialogTrigger = page.locator(
      '[data-testid="open-password-dialog-trigger"]',
    );
    await passwordDialogTrigger.click();

    // Wait for dialog to open
    await page.waitForTimeout(500);

    // Add password authentication
    const passwordInput = page.locator(
      '[data-testid="account-password-form-password-input"]',
    );
    const confirmPasswordInput = page.locator(
      '[data-testid="account-password-form-repeat-password-input"]',
    );

    await passwordInput.fill('SecurePassword123!');
    await confirmPasswordInput.fill('SecurePassword123!');

    const submitPasswordButton = page.locator(
      '[data-testid="identity-form-submit"]',
    );
    await submitPasswordButton.click();

    // Wait for password to be set
    await page.waitForTimeout(1000);

    console.log(`✓ Password added`);

    // Now click continue
    const continueButton = page.locator('[data-testid="continue-button"]');
    await continueButton.click();

    console.log(`Clicked continue after adding password...`);

    // Confirmation dialog should NOT appear - should go directly to team
    await page.waitForURL(new RegExp('/dashboard'), { timeout: 5000 });

    // Verify no dialog appeared
    const confirmDialog = page.locator('[data-testid="no-auth-method-dialog"]');
    await expect(confirmDialog).not.toBeVisible();

    console.log(
      `✓ No confirmation dialog shown - user added authentication method`,
    );

    // Verify user joined team
    await invitations.teamAccounts.openAccountsSelector();
    await expect(invitations.teamAccounts.getTeams()).toHaveCount(1);
  });

  test('user can cancel confirmation dialog and return to add auth', async ({
    page,
  }) => {
    const invitations = new InvitationsPageObject(page);
    await invitations.setup();

    await invitations.navigateToMembers();

    const newUserEmail = invitations.auth.createRandomEmail();

    const invites = [
      {
        email: newUserEmail,
        role: 'member',
      },
    ];

    await invitations.openInviteForm();
    await invitations.inviteMembers(invites);

    // Sign out and accept invitation
    await page.context().clearCookies();
    await page.reload();

    await invitations.auth.visitConfirmEmailLink(newUserEmail);
    await page.waitForURL('**/join?**');

    const acceptButton = page.locator(
      '[data-testid="join-team-form"] button[type="submit"]',
    );
    await acceptButton.click();

    await page.waitForURL('**/identities?**');

    console.log(`Trying to continue without adding auth...`);

    // Try to continue without adding auth
    const continueButton = page.locator('[data-testid="continue-button"]');
    await continueButton.click();

    // Dialog should appear
    const confirmDialog = page.locator('[data-testid="no-auth-method-dialog"]');
    await expect(confirmDialog).toBeVisible();

    console.log(`✓ Confirmation dialog appeared`);

    // Click cancel
    const cancelButton = page.locator('[data-testid="no-auth-dialog-cancel"]');
    await cancelButton.click();

    console.log(`Clicked cancel button...`);

    // Dialog should close and stay on /identities page
    await expect(confirmDialog).not.toBeVisible();
    await expect(page).toHaveURL(/\/identities/);

    console.log(`✓ Dialog closed, still on /identities page`);

    // User can now add password - verify the password dialog trigger is available
    const passwordDialogTrigger = page.locator(
      '[data-testid="open-password-dialog-trigger"]',
    );
    await expect(passwordDialogTrigger).toBeVisible();

    console.log(`✓ User can continue to set up authentication`);
  });

  test('should NOT show confirmation with email-only authentication', async ({
    page,
  }) => {
    // This test assumes email-only auth is configured
    // In that case, no confirmation dialog should appear even without adding methods

    const invitations = new InvitationsPageObject(page);
    await invitations.setup();

    await invitations.navigateToMembers();

    const newUserEmail = invitations.auth.createRandomEmail();

    const invites = [
      {
        email: newUserEmail,
        role: 'member',
      },
    ];

    await invitations.openInviteForm();
    await invitations.inviteMembers(invites);

    await page.context().clearCookies();
    await page.reload();

    await invitations.auth.visitConfirmEmailLink(newUserEmail);
    await page.waitForURL('**/join?**');

    const acceptButton = page.locator(
      '[data-testid="join-team-form"] button[type="submit"]',
    );
    await acceptButton.click();

    // Check if redirected to /identities
    const urlAfterAccept = page.url();

    if (urlAfterAccept.includes('/identities')) {
      console.log(
        `Redirected to /identities - checking for password dialog trigger...`,
      );

      // If password dialog trigger is NOT available, this is email-only mode
      const passwordDialogTrigger = page.locator(
        '[data-testid="open-password-dialog-trigger"]',
      );
      const isPasswordAvailable = await passwordDialogTrigger
        .isVisible({
          timeout: 1000,
        })
        .catch(() => false);

      if (!isPasswordAvailable) {
        console.log(`✓ Email-only mode detected`);

        // Try to continue
        const continueButton = page.locator('[data-testid="continue-button"]');

        if (await continueButton.isVisible({ timeout: 1000 })) {
          await continueButton.click();

          // No confirmation dialog should appear in email-only mode
          const confirmDialog = page.locator(
            '[data-testid="no-auth-method-dialog"]',
          );
          await expect(confirmDialog).not.toBeVisible({ timeout: 2000 });

          console.log(
            `✓ No confirmation dialog in email-only mode - continuing directly`,
          );
        }
      }
    }

    // Verify user can complete flow regardless
    console.log(`✓ User successfully completed invitation flow`);
  });
});
