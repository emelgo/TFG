import { Page, expect } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { OtpPo } from '../utils/otp.po';
import { isServerFnResponse } from '../utils/server-fn';

export class TeamAccountsPageObject {
  private readonly page: Page;
  public auth: AuthPageObject;
  public otp: OtpPo;

  constructor(page: Page) {
    this.page = page;
    this.auth = new AuthPageObject(page);
    this.otp = new OtpPo(page);
  }

  async setup(params = this.createTeamName()) {
    const auth = new AuthPageObject(this.page);

    const email = auth.createRandomEmail();

    await auth.bootstrapUser({
      email,
      name: 'Test User',
    });

    await auth.loginAsUser({ email });

    await this.createTeam(params);

    return {
      email: email,
      teamName: params.teamName,
      slug: params.slug,
    };
  }

  getTeamFromSelector(teamName: string) {
    return this.page.locator('[data-testid="workspace-team-item"]', {
      hasText: teamName,
    });
  }

  getTeams() {
    return this.page.locator('[data-testid="workspace-team-item"]');
  }

  goToSettings() {
    return expect(async () => {
      await this.page.goto('/settings');
      await this.page.waitForURL('**/settings');
    }).toPass();
  }

  goToMembers() {
    return expect(async () => {
      await this.page.goto('/settings/members');
      await this.page.waitForURL('**/settings/members');
    }).toPass();
  }

  goToBilling() {
    return expect(async () => {
      await this.page.goto('/settings/billing');
      return await this.page.waitForURL('**/settings/billing');
    }).toPass();
  }

  openAccountsSelector() {
    return expect(async () => {
      await this.page.click('[data-testid="workspace-dropdown-trigger"]');
      await this.page.click('[data-testid="workspace-switch-submenu"]');

      return expect(
        this.page.locator('[data-testid="workspace-switch-content"]'),
      ).toBeVisible();
    }).toPass();
  }

  async tryCreateTeam(teamName: string, slug?: string) {
    const nameInput = this.page.locator(
      '[data-testid="create-team-form"] [data-testid="team-name-input"]',
    );

    await nameInput.fill('');
    await nameInput.fill(teamName);

    // If slug is provided (for non-Latin names), fill the slug field
    if (slug) {
      const slugInput = this.page.locator(
        '[data-testid="create-team-form"] [data-testid="team-slug-input"]',
      );

      await expect(slugInput).toBeVisible();
      await slugInput.fill(slug);
    }

    return this.page.click(
      '[data-testid="create-team-form"] button:last-child',
    );
  }

  async createTeam({ teamName } = this.createTeamName()) {
    await this.openAccountsSelector();

    await this.page.click('[data-testid="create-team-trigger"]');

    await this.page.fill(
      '[data-testid="create-team-form"] [data-testid="team-name-input"]',
      teamName,
    );

    // Slug field is only shown for non-Latin names, so we don't fill it for Latin names
    // The database trigger will auto-generate the slug from the name

    const click = this.page.click(
      '[data-testid="create-team-form"] button:last-child',
    );

    const response = this.page.waitForURL(`/dashboard`);

    await Promise.all([click, response]);

    // Verify user landed on the team page
    await expect(this.page).toHaveURL(`/dashboard`);

    // Verify the team was created and appears in the selector
    await this.openAccountsSelector();
    await expect(this.getTeamFromSelector(teamName)).toBeVisible();

    await this.closeAccountsSelector();
  }

  async createTeamWithNonLatinName(teamName: string, slug: string) {
    await this.openAccountsSelector();

    await this.page.click('[data-testid="create-team-trigger"]');

    await this.page.fill(
      '[data-testid="create-team-form"] [data-testid="team-name-input"]',
      teamName,
    );

    // Wait for slug field to appear (triggered by non-Latin name)
    await expect(this.getSlugField()).toBeVisible();

    await this.page.fill(
      '[data-testid="create-team-form"] [data-testid="team-slug-input"]',
      slug,
    );

    const click = this.page.click(
      '[data-testid="create-team-form"] button:last-child',
    );

    const response = this.page.waitForURL(`/dashboard`);

    await Promise.all([click, response]);

    // Verify user landed on the team page
    await expect(this.page).toHaveURL(`/dashboard`);

    // Verify the team was created and appears in the selector
    await this.openAccountsSelector();
    await expect(this.getTeamFromSelector(teamName)).toBeVisible();

    await this.closeAccountsSelector();
  }

  async closeAccountsSelector() {
    await this.page.locator('body').click({ position: { x: 0, y: 0 } });

    await expect(
      this.page.locator('[data-testid="workspace-switch-content"]'),
    ).toBeHidden();
  }

  getSlugField() {
    return this.page.locator(
      '[data-testid="create-team-form"] [data-testid="team-slug-input"]',
    );
  }

  async updateTeamName(name: string) {
    await expect(async () => {
      await this.page.fill(
        '[data-testid="update-team-account-name-form"] input',
        name,
      );

      await Promise.all([
        this.page.click('[data-testid="update-team-account-name-form"] button'),
        // renaming a team changes its slug, so the server fn throws
        // redirect() (307) — don't filter on status here
        this.page.waitForResponse((response) =>
          isServerFnResponse(response, { method: 'POST' }),
        ),
      ]);
    }).toPass();
  }

  async deleteAccount(email: string) {
    await this.page.click('[data-testid="delete-team-trigger"]');
    await this.otp.completeOtpVerification(email);

    await expect(async () => {
      const click = this.page.click(
        '[data-testid="delete-team-form-confirm-button"]',
      );

      const response = this.page.waitForURL('**/dashboard');

      return Promise.all([click, response]);
    }).toPass();
  }

  async updateMemberRole(memberEmail: string, newRole: string) {
    await expect(async () => {
      // Find the member row and click the actions button
      const memberRow = this.page.getByRole('row', { name: memberEmail });
      await memberRow.getByRole('button').click();

      // Click the update role option in the dropdown menu
      await this.page.getByText('Update Role').click();

      // Select the new role
      await this.page.click('[data-testid="role-selector-trigger"]');
      await this.page.click(`[data-testid="role-option-${newRole}"]`);

      // Wait for the update to complete and page to reload
      const response = this.page.waitForResponse((response) =>
        isServerFnResponse(response, { method: 'POST', status: 200 }),
      );

      return Promise.all([
        this.page.click('[data-testid="confirm-update-member-role"]'),
        response,
      ]);
    }).toPass();
  }

  async transferOwnership(memberEmail: string, ownerEmail: string) {
    await expect(async () => {
      // Find the member row and click the actions button
      const memberRow = this.page.getByRole('row', { name: memberEmail });
      await memberRow.getByRole('button').click();

      // Click the transfer ownership option in the dropdown menu
      await this.page.getByText('Transfer Ownership').click();

      // Complete OTP verification
      await this.otp.completeOtpVerification(ownerEmail);

      // Wait for the transfer to complete and page to reload
      const response = this.page.waitForResponse((response) =>
        isServerFnResponse(response, { method: 'POST', status: 200 }),
      );

      return Promise.all([
        this.page.click('[data-testid="confirm-transfer-ownership-button"]'),
        response,
      ]);
    }).toPass();
  }

  createTeamName() {
    const random = (Math.random() * 100000000).toFixed(0);

    const teamName = `Team-Name-${random}`;
    const slug = `team-name-${random}`;

    return { teamName, slug };
  }
}
