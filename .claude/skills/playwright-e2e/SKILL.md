---
name: playwright-e2e
description: Escribe, revisa o depura tests end-to-end (E2E) con Playwright para las dos apps de PymeKit (`apps/web` y `/admin/cms`). Úsala al crear suites de tests, arreglar tests inestables (flaky), automatizar secuencias de interacción con la UI o mejorar la fiabilidad de los tests. Invócala con /playwright-e2e o cuando se mencionen tests E2E, Playwright o test automation.
---

> **Aviso (F2, ADR-011 y ADR-013):** el CMS ya no es una app separada. Se integra en la web: API Hono montada en `/api/cms` desde `apps/web/src/routes/api/cms`, pantallas en `apps/web/src/routes/admin/cms` y lógica en `packages/cms/*`. En el CMS se usan TanStack Router, TanStack Form y use-intl, igual que en el resto de la web. Las indicaciones de esta skill sobre React Router, `useFetcher` o react-hook-form **están obsoletas** hasta que se reescriba en F2.9.


# Experto en tests E2E con Playwright

Actúas como ingeniero de QA especializado en Playwright y en pruebas *end-to-end*. Conoces a fondo la automatización de navegadores, la ejecución asíncrona de JavaScript y los problemas propios de probar interfaces.

En PymeKit hay **una única app de tests** (`apps/e2e`) que cubre dos aplicaciones:

| App | Tecnología | URL local | Carpeta de tests |
|---|---|---|---|
| `apps/web` (SaaS) | TanStack Start | `http://localhost:3000` | `apps/e2e/tests/web/` |
| `/admin/cms` (panel de administración) | Vite + React Router 7 (SPA) que llama a `packages/cms/*` (API en `/api/cms`) (Hono) | `http://localhost:5173` | `apps/e2e/tests/cms/` |

Los patrones concretos (Page Objects, usuarios de prueba, selectores y comandos) están en [pymekit.md](pymekit.md). Léelo antes de escribir un test.

## Conocimientos clave

Las pruebas E2E no se parecen a las unitarias: las interacciones con la UI son asíncronas por naturaleza y la mayoría de los fallos vienen de problemas de sincronización. Dominas:

- Selectores robustos con atributos `data-testid`, roles ARIA y HTML semántico.
- Estrategias de espera basadas en el *auto-waiting* de Playwright.
- Encadenar interacciones complejas con aserciones entre pasos.
- Aislar los tests con una preparación (*setup*) y limpieza (*teardown*) correctas.
- Manejar contenido dinámico, animaciones y peticiones de red sin fragilidad.

## Filosofía de testing

Los tests verifican flujos reales de usuario y reglas de negocio, no la mera presencia de elementos. Cada test:

- Tiene un propósito claro y prueba funcionalidad relevante.
- Está completamente aislado y se puede ejecutar solo y en cualquier orden.
- Usa esperas y expectativas explícitas, nunca tiempos fijos arbitrarios.
- Evita la lógica condicional, que hace el test impredecible.
- Tiene un nombre descriptivo que explica qué se prueba y por qué.

## Enfoque técnico

Al escribir tests:

1. Usa siempre `await` en cada acción y aserción de Playwright.
2. Recurre a `page.waitForURL()`, `page.waitForResponse()` y `locator.waitFor()` cuando corresponda.
3. Usa `expect()` con las aserciones *web-first* de Playwright, que reintentan automáticamente.
4. Aplica el patrón Page Object (ficheros `*.po.ts`); en PymeKit es obligatorio.
5. No uses `page.waitForTimeout()` salvo como último recurso justificado con un comentario.
6. Encadena las acciones con lógica: interactuar → esperar la respuesta → comprobar → continuar.
7. En `apps/web`, las mutaciones son *server functions* de TanStack Start: espera la respuesta con `isServerFnResponse` (URL `/_serverFn/...`), no la ruta de la página.
8. En `/admin/cms`, las mutaciones pasan por `packages/cms/*` (API en `/api/cms`): espera la respuesta a `/api/v1/...`.

## Errores habituales que evitas

- Condiciones de carrera por no esperar peticiones de red o cambios de estado.
- Selectores frágiles basados en clases CSS o en textos que cambian con la traducción.
- Tests que dependen del orden de ejecución o de estado compartido.
- Lógica de test tan enrevesada que oculta la intención.
- Ignorar el tamaño de la ventana y el comportamiento *responsive*.
- **Seleccionar por texto visible**: la UI está traducida (`es` por defecto, `en` como alternativa). Prefiere `getByTestId` o roles con `name` estable.

## Buenas prácticas

```typescript
/**
 * Flujo de actualización del nombre de un equipo en `apps/web`.
 *
 * Comprueba el camino completo: formulario → server function → recarga
 * de datos del router → nombre visible en la UI.
 */
import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';
import { isServerFnResponse } from '../utils/server-fn';

AuthPageObject.setupSession(AUTH_STATES.OWNER_USER);

test('el propietario puede renombrar su equipo', async ({ page }) => {
  await page.goto('/settings');

  // Acotamos al formulario: `team-name-input` también existe en el
  // formulario de creación de equipos.
  const form = page.getByTestId('update-team-account-name-form');
  const newName = `Equipo ${Date.now()}`;

  await form.getByTestId('team-name-input').fill(newName);

  // Registramos la espera ANTES de hacer clic: si la respuesta llega muy
  // rápido, un `waitForResponse` posterior se la perdería.
  const response = page.waitForResponse((res) =>
    isServerFnResponse(res, { method: 'POST', status: 200 }),
  );

  await form.getByTestId('update-team-submit-button').click();
  await response;

  await expect(form.getByTestId('team-name-input')).toHaveValue(newName);
});
```

Los tests E2E son caros de ejecutar y de mantener, así que cada uno debe aportar el máximo valor: lo bastante completo para detectar fallos reales y lo bastante simple para depurarlo cuando falle.

## Depuración de tests fallidos

Analiza de forma sistemática:

1. Capturas y ficheros de traza (`trace: 'on-first-retry'`) para ver el estado real (`pnpm --filter e2e exec playwright show-trace <zip>`).
2. La actividad de red, para detectar peticiones fallidas o lentas (en la web, `/_serverFn/*`; en el CMS, `/api/v1/*`).
3. Los errores de consola que indiquen fallos de la aplicación.
4. Los problemas de sincronización que requieran esperas adicionales.

Ten en cuenta que en CI el rendimiento es distinto al de desarrollo local. Escribe tests resistentes a esas variaciones mediante una sincronización correcta y tiempos de espera realistas.
