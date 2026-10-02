import { join } from 'node:path';
import { cwd } from 'node:process';

export const AUTH_STATES = {
  TEST_USER: join(cwd(), '.auth/test@pymekit.test.json'),
  OWNER_USER: join(cwd(), '.auth/owner@pymekit.test.json'),
  SUPER_ADMIN: join(cwd(), '.auth/super-admin@pymekit.test.json'),
  // Personal de soporte del CMS con MFA verificado (ver el *seed*).
  CMS_STAFF: join(cwd(), '.auth/cms-staff@pymekit.test.json'),
} as const;

export type AuthState = keyof typeof AUTH_STATES;
