/**
 * Pruebas del cálculo de visibilidad de las secciones del CMS en la barra
 * lateral de la consola de administración.
 */
import { describe, expect, it } from 'vitest';

import {
  getCmsSectionVisibility,
  getCmsSettingsTabVisibility,
} from '../sections';

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
      access: {
        users: false,
        storage: false,
        auditLogs: true,
        members: false,
        systemSettings: false,
        permissions: false,
        resourceSettings: false,
      },
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
      access: {
        users: true,
        storage: true,
        auditLogs: true,
        members: true,
        systemSettings: true,
        permissions: true,
        resourceSettings: true,
      },
      visibleResourcesCount: 0,
    });

    expect(visibility.resources).toBe(false);
    expect(visibility.users).toBe(true);
  });
});

describe('getCmsSettingsTabVisibility (F2.7a)', () => {
  const base = {
    users: false,
    storage: false,
    auditLogs: true,
    members: false,
    systemSettings: false,
    permissions: false,
    resourceSettings: false,
  };

  it('sin acceso al CMS no muestra ninguna pestaña', () => {
    expect(getCmsSettingsTabVisibility(null)).toEqual({
      general: false,
      authentication: false,
      members: false,
      permissions: false,
      resources: false,
    });
  });

  it('el personal de soporte solo ve «General»', () => {
    expect(getCmsSettingsTabVisibility(base)).toEqual({
      general: true,
      authentication: false,
      members: false,
      permissions: false,
      resources: false,
    });
  });

  it('cada pestaña de gestión depende de su permiso', () => {
    expect(
      getCmsSettingsTabVisibility({ ...base, members: true }).members,
    ).toBe(true);
    expect(
      getCmsSettingsTabVisibility({ ...base, systemSettings: true })
        .authentication,
    ).toBe(true);
    // F2.7c: Recursos con el permiso de sistema `table`.
    expect(
      getCmsSettingsTabVisibility({ ...base, resourceSettings: true })
        .resources,
    ).toBe(true);
    // F2.7b: Permisos con `role:select` o `permission:select`.
    expect(
      getCmsSettingsTabVisibility({ ...base, permissions: true }).permissions,
    ).toBe(true);
  });
});
