import { defineConfig } from 'vitest/config';

// Tests unitarios del paquete de i18n (paridad de claves entre idiomas).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
