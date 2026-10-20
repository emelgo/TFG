/**
 * Configuración de Playwright para el escenario de evaluación (F6).
 *
 * Reutiliza la configuración común y solo cambia la URL base, que se lee de
 * `PLAYWRIGHT_BASE_URL` (por defecto `http://localhost:3300`), para poder
 * probar una segunda copia de la web sin ocupar el puerto 3100 del servidor
 * de desarrollo habitual.
 *
 * Uso: `pnpm exec playwright test -c playwright.scenario.config.ts
 * tests/scenario`.
 */
import { defineConfig } from '@playwright/test';

import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  reporter: 'list',
  use: {
    ...baseConfig.use,
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3300',
  },
  webServer: undefined,
});
