# Memoria del TFG

Memoria en LaTeX basada en la plantilla oficial de TFG de la ESI-UCA (importada desde Overleaf el 2026-10-20).

## Estructura

| Ruta | Contenido |
|---|---|
| `main.tex` | Documento principal: portadas, Prolegómeno, Desarrollo, Epílogo y Anexos |
| `config/` | Paquetes (`packages.tex`) y estilos (`styles.tex`) de la plantilla, más los añadidos para PymeKit (TikZ, `booktabs`, `pgfgantt`…) |
| `sections/frontmatter/` | Portadas, agradecimientos y resumen |
| `sections/preface/` | Introducción, antecedentes y plan de gestión del proyecto |
| `sections/development/` | Requisitos, análisis, diseño, construcción, pruebas y despliegue |
| `sections/epilogue/` | Conclusiones y licencia |
| `sections/backmatter/` | Manual del desarrollador, manual de usuario y evaluación de la reutilización |
| `figures/` | Logotipos e imágenes |
| `diagramas/` | Versiones PlantUML de algunas figuras (opcionales) |
| `bibliography.bib` | Bibliografía. Las entradas marcadas `% VERIFICAR` deben comprobarse antes de la entrega |

## Compilar

En el servidor (TeX Live instalado):

```bash
cd memoria
latexmk -pdf -outdir=build main.tex   # build/ está ignorado por git
```

## Llevarlo a Overleaf

1. Comprime la carpeta `memoria/` sin `build/` (por ejemplo, `zip -r memoria.zip memoria -x 'memoria/build/*'`).
2. En Overleaf: **Nuevo proyecto → Subir proyecto** y elige el `.zip`. El documento principal es `main.tex`.

## Pendientes del autor

- Los `\todo{…}` se ven en el PDF como notas al margen. Para la versión final se compila con `todonotes` en modo `disable` (`config/packages.tex`).
- En el fuente quedan comentarios `% PENDIENTE (P-06)`: cómo se presenta la parte reutilizada. Hay que confirmarlo con el tutor.
- La memoria no nombra los proyectos de referencia (ADR-007); `node scripts/tfg/check-branding.mjs` también revisa esta carpeta.
