/**
 * Pruebas del cálculo de visibilidad de las secciones del CMS en la barra
 * lateral de la consola de administración.
 */
import { describe, expect, it } from 'vitest';

import { getCmsSectionVisibility } from '../sections';

describe('getCmsSectionVisibility', () => {
  it('oculta todas las secciones si la API no concede acceso', () => {
    const visibility = getCmsSectionVisibility({
      access: null,
      visibleResourcesCount: 3,
    });

    expect(Object.values(visibility).every((visible) => !visible)).toBe(true);
  });

  it('muestra solo las secciones con permiso para el personal limitado', () => {
    const visibility = getCmsSectionVisibility({
      access: { users: false, storage: false, auditLogs: true },
      visibleResourcesCount: 2,
    });

    expect(visibility).toEqual({
      resources: true,
      users: false,
      storage: false,
      auditLogs: true,
      dashboards: true,
      settings: true,
    });
  });

  it('oculta el explorador de datos si no hay tablas legibles', () => {
    const visibility = getCmsSectionVisibility({
      access: { users: true, storage: true, auditLogs: true },
      visibleResourcesCount: 0,
    });

    expect(visibility.resources).toBe(false);
    expect(visibility.users).toBe(true);
  });
});
