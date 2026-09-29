/**
 * Pruebas de las claves de caché de la ficha de un registro: el orden de los
 * parámetros de la URL no debe crear entradas distintas para la misma fila.
 */
import { describe, expect, it } from 'vitest';

import { cmsQueryKeys } from '../queries';

describe('cmsQueryKeys.record', () => {
  it('cuelga del prefijo de la tabla (para invalidarlo junto al listado)', () => {
    const key = cmsQueryKeys.record({
      schema: 'public',
      table: 'accounts',
      keys: { id: '1' },
    });

    expect(key.slice(0, 4)).toEqual(
      cmsQueryKeys.table('public', 'accounts').slice(0, 4),
    );
  });

  it('ordena las columnas de una clave compuesta', () => {
    const a = cmsQueryKeys.record({
      schema: 'public',
      table: 'accounts_memberships',
      keys: { user_id: 'u', account_id: 'a' },
    });

    const b = cmsQueryKeys.record({
      schema: 'public',
      table: 'accounts_memberships',
      keys: { account_id: 'a', user_id: 'u' },
    });

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
