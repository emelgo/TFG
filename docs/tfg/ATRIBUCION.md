# Atribución del código de terceros

PymeKit se construye reutilizando, adaptando y ampliando dos productos comerciales. El autor del TFG los ha adquirido con la licencia correspondiente:

| Producto | Uso en PymeKit | Web |
|---|---|---|
| **Makerkit — TanStack Start + Supabase SaaS Starter Kit (Turbo)** | Base de la aplicación SaaS (`apps/web`), pruebas E2E y la mayoría de paquetes (`packages/*`) | https://makerkit.dev |
| **Supamode** (Supabase CMS / admin) | Base del CMS de datos (`apps/cms`, `apps/cms-api`, `packages/cms/*`) | https://makerkit.dev/supabase-cms |

**Condiciones que aplica este proyecto:**
- El repositorio es **privado** y solo tienen acceso el autor, el tutor y el tribunal.
- El código heredado se identifica en `docs/tfg/MAPA-REFERENCIAS.md`, que distingue lo reutilizado, lo adaptado y lo nuevo.
- Por decisión del autor, **la memoria del TFG no nombra estos productos** (ADR-007). La forma de presentar la base reutilizada está pendiente de confirmar con el tutor (P-06).
- Los nombres comerciales se han retirado del código y de la interfaz porque PymeKit es un producto distinto con identidad propia. Esa retirada no oculta el origen, que queda documentado aquí.

Estos nombres solo pueden aparecer en la documentación interna (`docs/tfg/`). Ni el código, ni la UI, ni la memoria los mencionan.
