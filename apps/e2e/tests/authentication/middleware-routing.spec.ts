import { expect, test } from '@playwright/test';

import { AUTH_STATES } from '../utils/auth-state';
import { AuthPageObject } from './auth.po';

test.describe('Middleware URL pattern routing', () => {
  test('super-admin password sign-in is redirected to /auth/verify by /dashboard middleware', async ({
    page,
  }) => {
    const auth = new AuthPageObject(page);

    await auth.goToSignIn();

    await auth.signIn({
      email: 'super-admin@makerkit.dev',
      password: 'testingpassword',
    });

    await page.waitForURL('**/auth/verify', { timeout: 10_000 });
    expect(page.url()).toContain('/auth/verify');

    await expect(async () => {
      await auth.submitMFAVerification(AuthPageObject.MFA_KEY);
    }).toPass({
      intervals: [500, 2_500, 5_000, 10_000, 20_000, 30_000],
    });

    await page.waitForURL('**/dashboard', { timeout: 10_000 });
  });

  test.describe('already-authenticated user visiting /auth/sign-in', () => {
    AuthPageObject.setupSession(AUTH_STATES.OWNER_USER);

    test('is redirected to /dashboard by /auth middleware', async ({
      page,
    }) => {
      await page.goto('/auth/sign-in');

      await page.waitForURL('**/dashboard', { timeout: 10_000 });
      expect(page.url()).toContain('/dashboard');
    });
  });

  test('anonymous user visiting /admin is redirected to /auth/sign-in by /admin middleware', async ({
    page,
  }) => {
    await page.goto('/admin');

    await page.waitForURL('**/auth/sign-in**', { timeout: 10_000 });
    expect(page.url()).toContain('/auth/sign-in');
  });
});
