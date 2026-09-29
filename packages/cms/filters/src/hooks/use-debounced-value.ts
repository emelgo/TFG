import { useEffect, useState } from 'react';

/**
 * Devuelve `value` con un retraso de `delayMs`: solo cambia cuando el valor
 * lleva ese tiempo sin modificarse. Sirve para no lanzar una búsqueda en la
 * API por cada tecla del autocompletado.
 *
 * El `useEffect` está justificado: sincroniza el estado con un temporizador
 * (un sistema externo a React) y lo cancela si el valor cambia antes.
 */
export function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);

    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
