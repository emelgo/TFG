---
name: decision
description: Registra una decisión de diseño o de alcance del TFG como ADR en docs/tfg/DECISIONES.md, con contexto, alternativas, consecuencias y requisitos relacionados. Úsalo cada vez que se elija entre alternativas técnicas o se cambie el alcance (ADR, architecture decision record).
argument-hint: <título o descripción breve de la decisión>
---

# /decision

Registra la decisión «$ARGUMENTS» en `docs/tfg/DECISIONES.md`.

1. Lee `DECISIONES.md` para conocer el formato y el último número. El nuevo ADR será el siguiente (`ADR-NNN`, con tres dígitos).
2. Comprueba si contradice o sustituye un ADR anterior. En ese caso, cambia el estado del antiguo a `Sustituida por ADR-NNN` (**nunca lo borres**).
3. Reúne la información necesaria:
   - **Contexto**: el problema y las fuerzas en juego, con datos del código si hacen falta.
   - **Decisión**: qué se hace, de forma concreta.
   - **Alternativas consideradas**: al menos dos, con el motivo del descarte.
   - **Consecuencias**: positivas, negativas y el trabajo que genera.
   - **Requisitos relacionados**: IDs de `REQUISITOS.md`.

   Si falta algo esencial (sobre todo, cuando la decisión le corresponde al autor), **pregúntaselo** en lugar de inventarlo. El estado será `Propuesta` hasta que el autor la acepte.
4. Añade el ADR al final del fichero, con la fecha de hoy y la fase actual (según `PROGRESO.md`).
5. Si la decisión cierra un punto abierto de `PLAN.md` (P-xx), actualiza su estado. Si cambia tareas, refleja el cambio en `PLAN.md` y `PROGRESO.md`.
6. Muestra el ADR resultante. Este registro alimentará después el capítulo de Diseño de la memoria.
