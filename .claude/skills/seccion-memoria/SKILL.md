---
name: seccion-memoria
description: Redacta un borrador LaTeX de una sección o capítulo de la memoria del TFG a partir del código real, las decisiones (ADR), los requisitos y la trazabilidad, usando el agente redactor-memoria. Úsalo al cerrar una fase o cuando el autor pida documentar algo en la memoria (thesis chapter, LaTeX).
argument-hint: <capítulo o tema, p. ej. "Diseño > Seguridad y RLS">
---

# /seccion-memoria

Redacta la sección «$ARGUMENTS» de la memoria.

1. **Ubicación**: consulta la estructura de capítulos en `docs/tfg/PLAN.md` (F8) y el contenido de `memoria/`.
   - Si ya existe la plantilla de la ESI, localiza el `.tex` del capítulo o crea uno nuevo siguiendo su convención, e incorpóralo con `\input{}` si hace falta.
   - Si no existe la plantilla (P-04 abierto), escribe en `memoria/borradores/<capitulo>.tex` en LaTeX estándar.
2. **Reunir material**:
   - ADR relacionados en `DECISIONES.md`.
   - Requisitos y filas de `TRAZABILIDAD.md`.
   - Código implicado: léelo, no lo supongas.
   - Si es la parte de implementación, `MAPA-REFERENCIAS.md` (reutilizado, adaptado o nuevo).
   - Incidencias y lecciones de `BITACORA.md` que afecten a la sección, sobre todo para *Pruebas*, *Seguridad* y *Conclusiones*.
   - Para *Planificación*: la sección «Dedicación» de `PROGRESO.md`.
3. **Redactar**: delega en el subagente `redactor-memoria` pasándole el tema, la ruta de destino y las fuentes reunidas. Si el tema es breve, puedes redactar tú mismo siguiendo sus mismas reglas de estilo.
4. **Revisar el borrador**:
   - No hay afirmaciones sin respaldo en el código ni datos inventados; lo que falte queda como `\todo{}` o `% PENDIENTE`.
   - No se nombran los proyectos de referencia (ADR-007); `node scripts/tfg/check-branding.mjs` lo comprueba.
   - Se citan los requisitos y los ADR.
5. **Registrar**: marca el avance en la sección F8 de `PROGRESO.md` y actualiza la columna «Memoria» de `TRAZABILIDAD.md` si cambió.
6. **Informe**: el fichero generado, un resumen de su estructura y la lista de pendientes para el autor.
