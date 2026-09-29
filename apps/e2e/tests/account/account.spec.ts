import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AccountPageObject } from './account.po';

test.describe('Account Settings', () => {
  let account: AccountPageObject;
  let email: string;

  test.beforeEach(async ({ page }) => {
    const auth = new AuthPageObject(page);

    email = auth.createRandomEmail();

    auth.bootstrapUser({
      email,
      password: 'testingpassword',
      name: 'Test User',
    });

    account = new AccountPageObject(page);

    await auth.loginAsUser({
      email,
      password: 'testingpassword',
      next: '/settings',
    });
  });

  test('user can update their profile name', async ({ page }) => {
    const name = 'John Doe';

    const request = account.updateName(name);

    const response = page.waitForResponse((resp) => {
      return resp.url().includes('accounts');
    });

    await Promise.all([request, response]);

    await page.goto('/dashboard');

    await page.locator('[data-testid="workspace-dropdown-trigger"]').click();

    await expect(account.getProfileName()).toHaveText(name);
  });

  test('user can update their email', async () => {
    const email = account.auth.createRandomEmail();

    await account.updateEmail(email);
  });

  test('user can update their password', async ({ page }) => {
    const password = (Math.random() * 100000).toString();

    const request = account.updatePassword(password);

    const response = page.waitForResponse((resp) => {
      return resp.url().includes('auth/v1/user');
    });

    await Promise.all([request, response]);

    await page.context().clearCookies();

    await page.reload();
  });
});

test.describe('Account Deletion', () => {
  test('user can delete their own account', async ({ page }) => {
    // Create a fresh user for this test since we'll be deleting it
    const auth = new AuthPageObject(page);
    const account = new AccountPageObject(page);

    const email = auth.createRandomEmail();

    await auth.bootstrapUser({
      email,
      password: 'testingpassword',
      name: 'Test User',
    });

    await auth.loginAsUser({ email, next: '/settings' });

    await account.deleteAccount(email);

    await page.waitForURL('/');

    await page.goto('/auth/sign-in');

    // sign in will now fail
    await auth.signIn({
      email,
      password: 'testingpassword',
    });

    await expect(
      page.locator('[data-testid="auth-error-message"]'),
    ).toBeVisible();
  });
});
