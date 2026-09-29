/**
 * Pruebas de la URL de la ficha de un registro (clave primaria simple o
 * compuesta, restricciones `unique` y casos sin identificador).
 */
import { describe, expect, it } from 'vitest';

import {
  buildResourceUrl,
  toRecordEditHref,
} from '../utils/build-resource-url';

describe('buildResourceUrl', () => {
  const createBasicTableMetadata = (overrides = {}) => ({
    primary_keys: [],
    unique_constraints: [],
    ...overrides,
  });

  describe('clave primaria simple', () => {
    it('construye la URL con una clave primaria simple', () => {
      const params = {
        schema: 'public',
        table: 'users',
        record: { id: 123, name: 'John' },
        tableMetadata: createBasicTableMetadata({
          primary_keys: [{ column_name: 'id' }],
        }),
      };

      const result = buildResourceUrl(params);
      expect(result).toBe('/admin/cms/resources/public/users/record/123');
    });

    it('admite claves primarias de texto', () => {
      const params = {
        schema: 'auth',
        table: 'users',
        record: { uuid: 'abc-123-def', email: 'test@example.com' },
        tableMetadata: createBasicTableMetadata({
          primary_keys: [{ column_name: 'uuid' }],
        }),
      };

      const result = buildResourceUrl(params);
      expect(result).toBe('/admin/cms/resources/auth/users/record/abc-123-def');
    });

    it('acepta 0 como clave primaria válida', () => {
      const params = {
        schema: 'public',
        table: 'items',
        record: { id: 0, name: 'Item Zero' },
        tableMetadata: createBasicTableMetadata({
          primary_keys: [{ column_name: 'id' }],
        }),
      };

      const result = buildResourceUrl(params);
      expect(result).toBe('/admin/cms/resources/public/items/record/0');
    });

    it('devuelve cadena vacía si falta el nombre de la columna clave', () => {
      const params = {
        schema: 'public',
        table: 'users',
        record: { name: 'John' },
        tableMetadata: createBasicTableMetadata({
          primary_keys: [{ column_name: null as unknown as string }],
        }),
      };

      const result = buildResourceUrl(params);
      expect(result).toBe('');
    });

    it('devuelve cadena vacía si el nombre de la columna clave está vacío', () => {
      const params = {
        schema: 'public',
        table: 'users',
        record: { name: 'John' },
        tableMetadata: createBasicTableMetadata({
          primary_keys: [{ column_name: '' }],
        }),
      };

      const result = buildResourceUrl(params);
      expect(result).toBe('');
    });
  });

  describe('clave primaria compuesta', () => {
    it('usa parámetros de consulta con una clave primaria compuesta', () => {
      const params = {
        schema: 'inventory',
        table: 'order_items',
        record: { order_id: 456, product_id: 789, quantity: 2 },
        tableMetadata: createBasicTableMetadata({
          primary_keys: [
            { column_name: 'order_id' },
            { column_name: 'product_id' },
          ],
        }),
      };

      const result = buildResourceUrl(params);
      expect(result).toBe(
        '/admin/cms/resources/inventory/order_items/record?order_id=456&product_id=789',
      );
    });

    it('admite claves compuestas de texto', () => {
      const params = {
        schema: 'content',
        table: 'translations',
        record: { lang: 'en', key: 'welcome.title', value: 'Welcome' },
        tableMetadata: createBasicTableMetadata({
          primary_keys: [{ column_name: 'lang' }, { column_name: 'key' }],
        }),
      };

      const result = buildResourceUrl(params);
      expect(result).toBe(
        '/admin/cms/resources/content/translations/record?lang=en&key=welcome.title',
      );
    });

    it('codifica los caracteres especiales de una clave compuesta', () => {
      const params = {
        schema: 'public',
        table: 'data',
        record: { tenant: 'my-org', key: 'config/settings.json' },
        tableMetadata: createBasicTableMetadata({
          primary_keys: [{ column_name: 'tenant' }, { column_name: 'key' }],
        }),
      };

      const result = buildResourceUrl(params);
      expect(result).toBe(
        '/admin/cms/resources/public/data/record?tenant=my-org&key=config%2Fsettings.json',
      );
    });
  });

  describe('restricciones unique', () => {
    it('usa una restricción unique de una columna si no hay clave primaria (codificada)', () => {
      const params = {
        schema: 'public',
        table: 'users',
        record: { email: 'user@example.com', name: 'John' },
        tableMetadata: createBasicTableMetadata({
          primary_keys: [],
          unique_constraints: [
            { constraint_name: 'email', columns: ['email'] },
          ],
        }),
      };

      const result = buildResourceUrl(params);
      expect(result).toBe(
        '/admin/cms/resources/public/users/record/user%40example.com',
      );
    });

    it('usa parámetros de consulta con una restricción unique de varias columnas', () => {
      const params = {
        schema: 'analytics',
        table: 'events',
        record: { user_id: 123, session_id: 'abc-def', event_type: 'click' },
        tableMetadata: createBasicTableMetadata({
          primary_keys: [],
          unique_constraints: [
            {
              constraint_name: 'user_id_session_id_key',
              columns: ['user_id', 'session_id'],
            },
          ],
        }),
      };

      const result = buildResourceUrl(params);
      expect(result).toBe(
        '/admin/cms/resources/analytics/events/record?user_id=123&session_id=abc-def',
      );
    });

    it('devuelve cadena vacía si la restricción unique no declara columnas', () => {
      const params = {
        schema: 'public',
        table: 'users',
        record: { name: 'John' },
        tableMetadata: createBasicTableMetadata({
          primary_keys: [],
          unique_constraints: [{ constraint_name: 'email', columns: [] }],
        }),
      };

      const result = buildResourceUrl(params);
      expect(result).toBe('');
    });

    it('prioriza la clave primaria sobre las restricciones unique', () => {
      const params = {
        schema: 'public',
        table: 'users',
        record: { id: 123, email: 'user@example.com' },
        tableMetadata: createBasicTableMetadata({
          primary_keys: [{ column_name: 'id' }],
          unique_constraints: [
            { constraint_name: 'email', columns: ['email'] },
          ],
        }),
      };

      const result = buildResourceUrl(params);
      expect(result).toBe('/admin/cms/resources/public/users/record/123');
    });
  });

  describe('sin identificadores', () => {
    it('devuelve cadena vacía sin clave primaria ni restricciones unique', () => {
      const params = {
        schema: 'public',
        table: 'logs',
        record: { message: 'Error occurred', timestamp: '2023-12-25' },
        tableMetadata: createBasicTableMetadata({
          primary_keys: [],
          unique_constraints: [],
        }),
      };

      const result = buildResourceUrl(params);
      expect(result).toBe('');
    });
  });

  describe('duplicados', () => {
    it('ignora claves primarias duplicadas', () => {
      const params = {
        schema: 'public',
        table: 'test',
        record: { id: 123 },
        tableMetadata: createBasicTableMetadata({
          primary_keys: [{ column_name: 'id' }, { column_name: 'id' }],
        }),
      };

      const result = buildResourceUrl(params);
      expect(result).toBe('/admin/cms/resources/public/test/record/123');
    });

    it('ignora restricciones unique duplicadas', () => {
      const params = {
        schema: 'public',
        table: 'test',
        record: { email: 'test@example.com' },
        tableMetadata: createBasicTableMetadata({
          primary_keys: [],
          unique_constraints: [
            { constraint_name: 'email', columns: ['email'] },
            { constraint_name: 'email', columns: ['email'] },
          ],
        }),
      };

      const result = buildResourceUrl(params);
      expect(result).toBe(
        '/admin/cms/resources/public/test/record/test%40example.com',
      );
    });
  });

  describe('casos límite', () => {
    it('admite booleanos como clave primaria', () => {
      const params = {
        schema: 'config',
        table: 'settings',
        record: { is_active: true, value: 'test' },
        tableMetadata: createBasicTableMetadata({
          primary_keys: [{ column_name: 'is_active' }],
        }),
      };

      const result = buildResourceUrl(params);
      expect(result).toBe('/admin/cms/resources/config/settings/record/true');
    });
    it('no genera URL si la clave primaria es null', () => {
      const params = {
        schema: 'public',
        table: 'test',
        record: { id: null, name: 'test' },
        tableMetadata: createBasicTableMetadata({
          primary_keys: [{ column_name: 'id' }],
        }),
      };

      const result = buildResourceUrl(params);
      expect(result).toBe('');
    });
    it('no genera URL si la fila no trae la clave primaria', () => {
      const params = {
        schema: 'public',
        table: 'test',
        record: { id: undefined, name: 'test' },
        tableMetadata: createBasicTableMetadata({
          primary_keys: [{ column_name: 'id' }],
        }),
      };

      const result = buildResourceUrl(params);
      expect(result).toBe('');
    });

    it('codifica los caracteres con significado en la ruta', () => {
      const params = {
        schema: 'public',
        table: 'test',
        record: { id: 'a/b?c#d', name: 'test' },
        tableMetadata: createBasicTableMetadata({
          primary_keys: [{ column_name: 'id' }],
        }),
      };

      const result = buildResourceUrl(params);
      expect(result).toBe(
        '/admin/cms/resources/public/test/record/a%2Fb%3Fc%23d',
      );
    });

    it('tolera metadatos vacíos', () => {
      const params = {
        schema: 'public',
        table: 'test',
        record: { data: 'test' },
        tableMetadata: {
          primary_keys: [],
          unique_constraints: [],
        },
      };

      const result = buildResourceUrl(params);
      expect(result).toBe('');
    });
  });
});

describe('toRecordEditHref', () => {
  it('añade `/edit` tras la clave de una columna', () => {
    expect(toRecordEditHref('/admin/cms/resources/public/a/record/7')).toBe(
      '/admin/cms/resources/public/a/record/7/edit',
    );
  });

  it('con clave compuesta, `/edit` va antes de los parámetros', () => {
    expect(
      toRecordEditHref('/admin/cms/resources/public/m/record?u=1&a=2'),
    ).toBe('/admin/cms/resources/public/m/record/edit?u=1&a=2');
  });
});
