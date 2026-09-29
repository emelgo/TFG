import { join } from 'node:path';
import { cwd } from 'node:process';

export const AUTH_STATES = {
  TEST_USER: join(cwd(), '.auth/test@makerkit.dev.json'),
  OWNER_USER: join(cwd(), '.auth/owner@makerkit.dev.json'),
  SUPER_ADMIN: join(cwd(), '.auth/super-admin@makerkit.dev.json'),
} as const;

export type AuthState = keyof typeof AUTH_STATES;
