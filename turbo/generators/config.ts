/**
 * Generadores de código del monorepo (`pnpm turbo gen <generador>`).
 *
 * Turborepo usa Plop por debajo: cada generador declara unas preguntas y
 * unas acciones (crear ficheros a partir de plantillas Handlebars `.hbs`,
 * modificarlos o ejecutar comandos). Sirven para que quien reutiliza PymeKit
 * cree piezas nuevas con la misma estructura que las existentes, sin
 * copiarlas a mano. Están documentados en `docs/CONFIGURACION.md`.
 *
 * [TFG] RNF-01 (reutilización): se crean paquetes y funcionalidades nuevas
 * con la convención del monorepo.
 */
import type { PlopTypes } from '@turbo/gen';

import { createPackageGenerator } from './templates/package/generator';

// Generadores registrados. Los heredados para Docker y Cloudflare se
// retiraron en la F5: generaban configuración de otro *framework* y el
// despliegue ya tiene su propio Dockerfile (ADR-022).
const generators = [createPackageGenerator];

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  generators.forEach((gen) => gen(plop));
}
