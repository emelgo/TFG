import { expect, test } from '@playwright/test';

import { AuthPageObject } from './auth.po';

const newPassword = (Math.random() * 10000).toString();

test.describe('Password Reset Flow', () => {
  test('will reset the password and sign in with new one', async ({ page }) => {
    const auth = new AuthPageObject(page);
    const email = auth.createRandomEmail();

    await auth.bootstrapUser({
      email,
      password: 'password',
      name: 'Test User',
    });

    await page.goto('/auth/password-reset');
    await page.waitForTimeout(200);

    const emailLocator = page.locator('[name=email]');

    await expect(emailLocator).toBeEnabled();

    await emailLocator.fill(email);

    await expect(async () => {
      const button = page.locator('button[type="submit"]');

      await expect(button).toBeEnabled();

      return Promise.all([
        button.click(),
        page.waitForResponse((resp) => resp.request().method() === 'POST'),
      ]);
    }).toPass();

    await auth.visitConfirmEmailLink(email, {
      deleteAfter: true,
    });

    await page.waitForURL(new RegExp('/update-password?.*'), {
      timeout: 2000,
    });

    await auth.updatePassword(newPassword);
    await page.waitForURL('/dashboard');

    await page.context().clearCookies();
    await page.reload();

    await page.goto('/auth/sign-in');

    await auth.loginAsUser({
      email,
      password: newPassword,
      next: '/dashboard',
    });
  });
});
