/**
 * Pruebas de la conversión entre instantes y el valor de un control
 * `datetime-local` en la zona horaria de las preferencias del CMS.
 */
import { describe, expect, it } from 'vitest';

import {
  fromDateTimeInputValue,
  toDateTimeInputValue,
} from '../utils/datetime-input';

describe('datetime-input', () => {
  it('muestra el instante en la zona indicada', () => {
    expect(toDateTimeInputValue('2025-07-01T10:00:00Z', 'UTC')).toBe(
      '2025-07-01T10:00:00',
    );
    expect(toDateTimeInputValue('2025-07-01T10:00:00Z', 'Europe/Madrid')).toBe(
      '2025-07-01T12:00:00',
    );
    expect(toDateTimeInputValue('no es fecha', 'UTC')).toBe('');
  });

  it('interpreta el valor del control en la zona indicada', () => {
    expect(fromDateTimeInputValue('2025-07-01T12:00', 'Europe/Madrid')).toBe(
      '2025-07-01T10:00:00.000Z',
    );
    expect(fromDateTimeInputValue('2025-01-01T00:00:30', 'UTC')).toBe(
      '2025-01-01T00:00:30.000Z',
    );
    expect(fromDateTimeInputValue('mañana', 'UTC')).toBeNull();
  });

  it('ida y vuelta conservan el instante', () => {
    const iso = '2025-03-30T01:30:00.000Z';

    expect(
      fromDateTimeInputValue(
        toDateTimeInputValue(iso, 'America/New_York'),
        'America/New_York',
      ),
    ).toBe(iso);
  });
});
