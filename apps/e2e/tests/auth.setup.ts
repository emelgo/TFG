import { test } from '@playwright/test';

import { AuthPageObject } from './authentication/auth.po';

import { join } from 'node:path';
import { cwd } from 'node:process';

const testAuthFile = join(cwd(), '.auth/test@makerkit.dev.json');
const ownerAuthFile = join(cwd(), '.auth/owner@makerkit.dev.json');
const superAdminAuthFile = join(cwd(), '.auth/super-admin@makerkit.dev.json');

test('authenticate as test user', async ({ page }) => {
  const auth = new AuthPageObject(page);

  await auth.loginAsUser({
    email: 'test@makerkit.dev',
  });

  await page.context().storageState({ path: testAuthFile });
});

test('authenticate as owner user', async ({ page }) => {
  const auth = new AuthPageObject(page);

  await auth.loginAsUser({
    email: 'owner@makerkit.dev',
  });

  await page.context().storageState({ path: ownerAuthFile });
});

test('authenticate as super-admin user', async ({ page }) => {
  const auth = new AuthPageObject(page);

  await auth.loginAsSuperAdmin({});

  await page.context().storageState({ path: superAdminAuthFile });
});
