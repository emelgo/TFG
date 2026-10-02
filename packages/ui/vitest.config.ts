/**
 * Configuración de Vitest de `@pymekit/ui`.
 *
 * El `tsconfig` del paquete deja el JSX sin transformar (`preserve`), porque
 * de eso se encarga la *build* de cada app. Las pruebas que renderizan un
 * componente en el servidor (`SafeMarkdown`) necesitan que Vitest lo
 * transforme con el *runtime* automático de React.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    environment: 'node',
  },
});
