/**
 * Generador `package`: crea un paquete nuevo del monorepo con el scope
 * `@pymekit/*`.
 *
 * Pregunta el tipo (funcionalidad de negocio en `packages/features/<nombre>`,
 * como `accounts` o `team-accounts`, o paquete de infraestructura en
 * `packages/<nombre>`), el nombre y las dependencias. Crea `package.json`,
 * `tsconfig.json` y un `src/index.ts` mínimos, añade las dependencias con
 * `pnpm add` (que respeta el catálogo de versiones de `pnpm-workspace.yaml`,
 * `catalogMode: prefer`) y formatea el resultado.
 *
 * Uso: `pnpm turbo gen package`, o sin preguntas:
 * `pnpm turbo gen package --args feature bookings "zod"`.
 */
import type { PlopTypes } from '@turbo/gen';

import { execSync } from 'node:child_process';

const SCOPE = '@pymekit/';

export function createPackageGenerator(plop: PlopTypes.NodePlopAPI) {
  plop.setGenerator('package', {
    description: 'Crea un paquete nuevo del monorepo (@pymekit/*)',
    prompts: [
      {
        type: 'list',
        name: 'kind',
        message: '¿Qué tipo de paquete es?',
        choices: [
          {
            name: 'Funcionalidad de negocio (packages/features/<nombre>)',
            value: 'feature',
          },
          {
            name: 'Paquete de infraestructura (packages/<nombre>)',
            value: 'package',
          },
        ],
      },
      {
        type: 'input',
        name: 'name',
        message: `Nombre del paquete, en inglés y en kebab-case (sin el prefijo ${SCOPE})`,
        validate: (input: string) =>
          /^[a-z][a-z0-9-]*$/.test(input.replace(SCOPE, '')) ||
          'Usa solo minúsculas, números y guiones (por ejemplo, «bookings»)',
      },
      {
        type: 'input',
        name: 'deps',
        message: 'Dependencias separadas por espacios (opcional)',
      },
    ],
    actions: [
      (answers) => {
        if ('name' in answers && typeof answers.name === 'string') {
          answers.name = answers.name.replace(SCOPE, '');
        }

        if ('kind' in answers) {
          answers.dir =
            answers.kind === 'feature' ? 'packages/features' : 'packages';
        }

        return 'Respuestas normalizadas';
      },
      {
        type: 'add',
        path: '{{ dir }}/{{ name }}/package.json',
        templateFile: 'templates/package/package.json.hbs',
      },
      {
        type: 'add',
        path: '{{ dir }}/{{ name }}/tsconfig.json',
        templateFile: 'templates/package/tsconfig.json.hbs',
      },
      {
        type: 'add',
        path: '{{ dir }}/{{ name }}/src/index.ts',
        templateFile: 'templates/package/index.ts.hbs',
      },
      (answers) => {
        const { name, deps } = answers as { name: string; deps?: string };
        const list = (deps ?? '').split(' ').filter(Boolean);

        // `pnpm add` en lugar de consultar el registro de npm: así se usa la
        // versión del catálogo cuando la dependencia ya está en él
        if (list.length > 0) {
          execSync(`pnpm add --filter ${SCOPE}${name} ${list.join(' ')}`, {
            stdio: 'inherit',
          });
        } else {
          execSync('pnpm install', { stdio: 'inherit' });
        }

        execSync('pnpm run format:fix');

        return `Paquete ${SCOPE}${name} creado`;
      },
    ],
  });
}
