/**
 * Pruebas de `buildParameterizedStatement` (BITACORA B-24).
 *
 * El código heredado sustituía los marcadores `$n` dentro del texto SQL y lo
 * ejecutaba sin parámetros. Estas pruebas fijan que ahora los valores viajan
 * siempre como parámetros enlazados, incluso los que contienen comillas o la
 * propia cadena de un marcador, que era el vector de inyección.
 *
 * [TFG] RNF-02.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { buildParameterizedStatement } from '../authorization.service';

const dialect = new PgDialect();

function render(query: string, params: unknown[]) {
  return dialect.sqlToQuery(buildParameterizedStatement(query, params));
}

describe('buildParameterizedStatement', () => {
  it('convierte cada marcador en un parámetro enlazado', () => {
    const { sql, params } = render('select $1 as a, $2 as b', ['x', 42]);

    expect(sql).toBe('select $1 as a, $2 as b');
    expect(params).toEqual(['x', 42]);
  });

  it('no mezcla en el texto SQL un valor que contiene un marcador y comillas', () => {
    // El ataque heredado: el primer valor contiene «$2»; la sustitución
    // manual metía el segundo valor dentro del literal del primero.
    const malicious = "tabla$2' or true --";

    const { sql, params } = render('select $1 as a, $2 as b', [
      malicious,
      "otro' valor",
    ]);

    expect(sql).toBe('select $1 as a, $2 as b');
    expect(sql).not.toContain('or true');
    expect(params).toEqual([malicious, "otro' valor"]);
  });

  it('respeta marcadores de dos cifras sin confundir $1 con $10', () => {
    const values = Array.from({ length: 10 }, (_, i) => `v${i + 1}`);
    const query = values.map((_, i) => `$${i + 1}`).join(', ');

    const { params } = render(`select ${query}`, values);

    expect(params).toEqual(values);
  });

  it('rechaza un marcador sin valor', () => {
    expect(() => render('select $1, $2', ['solo-uno'])).toThrow(
      'Missing value for placeholder $2',
    );
  });
});
