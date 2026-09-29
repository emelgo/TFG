# Memoria del TFG

Esta carpeta contiene la memoria del TFG en LaTeX, basada en la plantilla oficial que el autor tiene en Overleaf.

## Cómo traer la plantilla desde Overleaf (pendiente, P-04)

1. Abre el proyecto en [overleaf.com](https://www.overleaf.com).
2. Pulsa **Menú** (icono ☰, arriba a la izquierda).
3. En la sección **Descargar**, elige **Código fuente**. Se descarga un `.zip` con todos los `.tex`, las imágenes y el `.bib`.
4. Descomprímelo en esta carpeta, `memoria/`. También puedes dejar el `.zip` en `/home/admin/TFG/` y pedir a Claude que lo integre.
5. Comprueba que compila en local con `latexmk -pdf <principal>.tex` (hace falta tener instalado TeX Live) o vuelve a subirlo a Overleaf.

> Alternativa: con Overleaf Premium se puede sincronizar el proyecto con GitHub o por git (Menú → Sincronizar). Con la versión gratuita, el método es el `.zip`.

## Organización

- `borradores/`: secciones redactadas con `/seccion-memoria` mientras no existe la plantilla. Luego se mueven a los capítulos correspondientes.
- La estructura de capítulos prevista está en `docs/tfg/PLAN.md` (F8).
- Los artefactos de compilación (`*.aux`, `*.log`, …) están ignorados en `.gitignore`.
