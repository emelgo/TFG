import { Page, expect } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { TeamAccountsPageObject } from '../team-accounts/team-accounts.po';
import { isServerFnResponse } from '../utils/server-fn';

export class InvitationsPageObject {
  private readonly page: Page;
  public auth: AuthPageObject;
  public teamAccounts: TeamAccountsPageObject;

  constructor(page: Page) {
    this.page = page;
    this.auth = new AuthPageObject(page);
    this.teamAccounts = new TeamAccountsPageObject(page);
  }

  setup() {
    return this.teamAccounts.setup();
  }

  public async inviteMembers(
    invites: Array<{
      email: string;
      role: string;
    }>,
  ) {
    const form = this.getInviteForm();

    for (let index = 0; index < invites.length; index++) {
      const invite = invites[index];

      if (!invite) {
        continue;
      }

      console.log(`Inviting ${invite.email} with role ${invite.role}...`);

      const nth = index + 1;

      await this.page.fill(
        `[data-testid="invite-member-form-item"]:nth-child(${nth}) [data-testid="invite-email-input"]`,
        invite.email,
      );

      await this.page.click(
        `[data-testid="invite-member-form-item"]:nth-child(${nth}) [data-testid="role-selector-trigger"]`,
      );

      await this.page.getByRole('option', { name: invite.role }).click();

      if (index < invites.length - 1) {
        await form.locator('[data-testid="add-new-invite-button"]').click();
      }
    }

    await Promise.all([
      form.locator('button[type="submit"]').click(),
      this.page.waitForResponse((response) =>
        isServerFnResponse(response, { method: 'POST', status: 200 }),
      ),
    ]);
  }

  navigateToMembers() {
    return expect(async () => {
      await this.page.goto('/settings/members');
      await this.page.waitForURL('**/settings/members');
    }).toPass();
  }

  async openInviteForm() {
    await expect(async () => {
      await this.page.click('[data-testid="invite-members-form-trigger"]');

      return await expect(this.getInviteForm()).toBeVisible();
    }).toPass();
  }

  getInvitations() {
    return this.page.locator('[data-testid="invitation-email"]');
  }

  async deleteInvitation(email: string) {
    const actions = this.getInvitationRow(email).getByRole('button');

    await actions.click();

    await this.page
      .locator('[data-testid="remove-invitation-trigger"]')
      .click();

    await this.page.click(
      '[data-testid="delete-invitation-form"] button[type="submit"]',
    );
  }

  getInvitationRow(email: string) {
    return this.page.getByRole('row', { name: email });
  }

  async updateInvitation(email: string, role: string) {
    const row = this.getInvitationRow(email);
    const actions = row.getByRole('button');

    await actions.click();

    await this.page
      .locator('[data-testid="update-invitation-trigger"]')
      .click();

    await this.page.click(`[data-testid="role-selector-trigger"]`);
    await this.page.click(`[data-testid="role-option-${role}"]`);

    await this.page.click(
      '[data-testid="update-invitation-form"] button[type="submit"]',
    );
  }

  async acceptInvitation() {
    console.log('Accepting invitation...');

    const click = this.page
      .locator('[data-testid="join-team-form"] button[type="submit"]')
      .click();

    // the accept-invitation server fn throws redirect() (307), so don't
    // filter on status here
    const response = this.page.waitForResponse((response) =>
      isServerFnResponse(response, { method: 'POST' }),
    );

    await Promise.all([click, response]);

    // wait for animation to complete
    await this.page.waitForTimeout(500);

    // skip authentication setup
    const continueButton = this.page.locator('[data-testid="continue-button"]');

    if (
      await continueButton.isVisible({
        timeout: 1000,
      })
    ) {
      await continueButton.click();

      // Handle confirmation dialog that appears when skipping without adding auth
      const confirmationDialog = this.page.locator(
        '[data-testid="no-auth-method-dialog"]',
      );

      if (
        await confirmationDialog.isVisible({
          timeout: 2000,
        })
      ) {
        console.log('Confirmation dialog appeared, clicking Continue...');
        await this.page
          .locator('[data-testid="no-auth-dialog-continue"]')
          .click();
      }
    }

    // wait for redirect to account home
    await this.page.waitForURL(new RegExp('/dashboard'));
  }

  private getInviteForm() {
    return this.page.locator('[data-testid="invite-members-form"]');
  }
}
