import { join } from 'node:path';
import { cwd } from 'node:process';

export const AUTH_STATES = {
  TEST_USER: join(cwd(), '.auth/test@makerkit.dev.json'),
  OWNER_USER: join(cwd(), '.auth/owner@makerkit.dev.json'),
  SUPER_ADMIN: join(cwd(), '.auth/super-admin@makerkit.dev.json'),
  // Personal de soporte del CMS con MFA verificado (ver el *seed*).
  CMS_STAFF: join(cwd(), '.auth/cms-staff@pymekit.test.json'),
} as const;

export type AuthState = keyof typeof AUTH_STATES;
