# Borradores de la memoria

Primeros borradores LaTeX de la memoria del TFG, escritos mientras no existe la plantilla oficial de la ESI (punto abierto **P-04**). Están en LaTeX estándar para poder integrarlos después sin reescribirlos.

**Estado:** borradores a fecha 2026-09-29 (F2.4b cerrada). Todo lo que falta o debe decidir el autor está marcado con `\todo{…}` (visible en el PDF) o con comentarios `% PENDIENTE …` y `% VERIFICAR …` (solo en el fuente).

| Fichero | Capítulo | Estado |
|---|---|---|
| `02-planificacion.tex` | 2. Planificación: metodología (incremental + asistida por agentes de IA), fases y EDT, temporización, riesgos, herramientas y costes | Completo salvo horas reales, Gantt y costes |
| `04-analisis.tex` | 4. Análisis: contexto, actores, RF, RNF y casos de uso | Completo salvo flujos detallados de los CU (tras F6) |
| `05-diseno.tex` | 5. Diseño (**parcial**): arquitectura, multi-tenant y RBAC, seguridad en profundidad, decisiones y verificación de la seguridad | Falta modelo de datos, pagos y adaptación a pymes (F5) |
| `referencias.bib` | Bibliografía citada | Todas las entradas marcadas `% VERIFICAR` |
| `diagramas/*.puml` | Versiones PlantUML de las figuras TikZ | Alternativas opcionales |
| `borradores.tex` | Documento de previsualización (no es la memoria) | Solo para compilar los borradores sueltos |

## Cómo integrarlos en la plantilla

1. Copiar los `.tex` a la carpeta de capítulos de la plantilla y hacer `\input` de cada uno. Si la plantilla numera los capítulos de otra forma, ajustar los `\chapter` y las etiquetas (`cap:`, `sec:`, `tab:`, `fig:`).
2. Añadir al preámbulo los paquetes que usan: `booktabs`, `tabularx`, `array`, `enumitem`, `tikz` (bibliotecas `positioning`, `arrows.meta`, `shapes.geometric`, `fit`, `backgrounds`, `calc`), `todonotes` y `hyperref`.
3. Fusionar `referencias.bib` con el `.bib` de la plantilla tras verificar cada entrada.
4. Resolver los pendientes y, al final, quitar `todonotes` (o compilar con su opción `disable`) para comprobar que no queda ninguno.
5. Compilar: `latexmk -pdf borradores.tex` (previsualización) o el principal de la plantilla. Los borradores **no se han compilado** en el entorno donde se generaron (no hay TeX Live instalado): revisar el ajuste de tablas y figuras.

## Reglas que siguen

- No se nombran los proyectos de referencia (ADR-007). Cómo presentar la base reutilizada está pendiente de **P-06**: los puntos afectados llevan `% PENDIENTE (P-06)`.
- Las cifras (horas, pruebas, paquetes) salen de `docs/tfg/` y del historial de git. Las horas son estimaciones que el autor debe revisar.
- Cada borrador se regenera o actualiza con `/seccion-memoria` al cerrar fases.
