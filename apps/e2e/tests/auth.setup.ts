import { test } from '@playwright/test';

import { AuthPageObject } from './authentication/auth.po';

import { join } from 'node:path';
import { cwd } from 'node:process';

const testAuthFile = join(cwd(), '.auth/test@pymekit.test.json');
const ownerAuthFile = join(cwd(), '.auth/owner@pymekit.test.json');
const superAdminAuthFile = join(cwd(), '.auth/super-admin@pymekit.test.json');
const cmsStaffAuthFile = join(cwd(), '.auth/cms-staff@pymekit.test.json');

test('authenticate as test user', async ({ page }) => {
  const auth = new AuthPageObject(page);

  await auth.loginAsUser({
    email: 'test@pymekit.test',
  });

  await page.context().storageState({ path: testAuthFile });
});

test('authenticate as owner user', async ({ page }) => {
  const auth = new AuthPageObject(page);

  await auth.loginAsUser({
    email: 'owner@pymekit.test',
  });

  await page.context().storageState({ path: ownerAuthFile });
});

test('authenticate as super-admin user', async ({ page }) => {
  const auth = new AuthPageObject(page);

  await auth.loginAsSuperAdmin({});

  await page.context().storageState({ path: superAdminAuthFile });
});

// Personal del CMS con acceso limitado (rol «Soporte» del *seed*). Inicia
// sesión con el segundo factor para que la sesión guardada sea aal2, como
// exige el CMS.
test('authenticate as CMS staff user', async ({ page }) => {
  const auth = new AuthPageObject(page);

  await auth.loginAsCmsStaff({});

  await page.context().storageState({ path: cmsStaffAuthFile });
});
