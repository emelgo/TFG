/**
 * Mensajes de validación de Zod en español.
 *
 * Muchos esquemas de los formularios usan las validaciones de Zod sin
 * mensaje propio (`z.string().email()`, `.min(8)`…). Zod trae sus mensajes
 * por defecto en inglés («Invalid email address»), y `FieldError` los
 * mostraría tal cual porque no son claves i18n. Activar aquí el idioma
 * español de Zod cubre todos esos casos de una vez, en el servidor y en el
 * navegador (este módulo se importa desde `router.tsx`, que se ejecuta en
 * ambos lados).
 *
 * [TFG] ADR-021: la interfaz solo está en español. Si se añade otro idioma,
 * este es el punto donde elegir el idioma de Zod según el locale activo.
 */
import * as z from 'zod';

z.config(z.locales.es());
