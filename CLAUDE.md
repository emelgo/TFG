@AGENTS.md

## Notas específicas para Claude Code

- Al iniciar la sesión, el hook `SessionStart` muestra la fase actual y los pendientes de `docs/tfg/PROGRESO.md`. Úsalo como punto de partida.
- Después de cada `Edit`/`Write`, un hook ejecuta `scripts/tfg/check-branding.mjs` sobre el fichero modificado. Si avisa de alguna referencia a los proyectos de referencia, corrígela antes de seguir.
- La escritura en `../makerkit` y `../supamode` está denegada en `.claude/settings.json`. Si necesitas algo de allí, cópialo con `/portar-modulo`.
- Para las tareas grandes de una fase (portar un paquete entero, traducir comentarios de un módulo), divide el trabajo por paquete y verifica cada uno antes de pasar al siguiente.
- Habla con el autor en español.
