# @pymekit/analytics

Capa de analítica desacoplada del proveedor: un `AnalyticsManager` reparte cada llamada (`trackEvent`, `trackPageView`, `identify`) entre los proveedores registrados. Por defecto solo está registrado el proveedor `null` (`NullAnalyticsService`), que no envía nada.

## Reglas obligatorias

1. Cliente: `import { analytics } from '@pymekit/analytics'`. Servidor: `import { analytics } from '@pymekit/analytics/server'`.
2. NUNCA se envían datos personales (emails, nombres, IP) en las propiedades de los eventos.
3. Las páginas vistas y la identificación de usuarios se gestionan de forma centralizada en `AnalyticsProvider`: no se llama a `trackPageView` ni a `identify` sueltos desde los componentes de las funcionalidades. Para enviar un evento nuevo, se emite con `useAppEvents().emit(...)` y se añade al mapa `analyticsMapping` del proveedor.
4. NUNCA se crea un proveedor propio sin implementar la interfaz `AnalyticsService` completa (`initialize`, `trackEvent`, `trackPageView`, `identify`, definida en `src/types.ts`).

## Ejemplo de referencia

- `apps/web/src/components/analytics-provider.tsx`: traduce los eventos de la app a llamadas de analítica y registra las páginas vistas al navegar.
- `src/index.ts`: registro de proveedores con `createAnalyticsManager({ providers })`.
