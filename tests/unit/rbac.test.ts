import { describe, expect, it } from 'vitest';

import {
  ALL_PERMISSIONS,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isRole,
  PERMISSIONS,
  permissionsForRole,
  ROLE_LIST,
  ROLE_PERMISSIONS,
} from '@/lib/rbac';

describe('catálogo de roles y permisos', () => {
  it('el administrador tiene todos los permisos', () => {
    expect(ROLE_PERMISSIONS.ADMIN).toHaveLength(ALL_PERMISSIONS.length);
  });

  it('ningún rol declara permisos inexistentes', () => {
    for (const role of ROLE_LIST) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(ALL_PERMISSIONS).toContain(permission);
      }
    }
  });

  it('no hay permisos duplicados dentro de un rol', () => {
    for (const role of ROLE_LIST) {
      const unique = new Set(ROLE_PERMISSIONS[role]);
      expect(unique.size).toBe(ROLE_PERMISSIONS[role].length);
    }
  });
});

describe('separación de responsabilidades', () => {
  it('ventas no puede recibir compras ni ajustar inventario', () => {
    const granted = permissionsForRole('SALES');
    expect(hasPermission(granted, PERMISSIONS.PURCHASES_RECEIVE)).toBe(false);
    expect(hasPermission(granted, PERMISSIONS.INVENTORY_ADJUST)).toBe(false);
  });

  it('bodega no puede cobrar ni ver finanzas', () => {
    const granted = permissionsForRole('WAREHOUSE');
    expect(hasPermission(granted, PERMISSIONS.RECEIVABLES_COLLECT)).toBe(false);
    expect(hasPermission(granted, PERMISSIONS.FINANCE_VIEW)).toBe(false);
  });

  it('contabilidad no puede crear ventas ni recibir compras', () => {
    const granted = permissionsForRole('ACCOUNTANT');
    expect(hasPermission(granted, PERMISSIONS.SALES_CREATE)).toBe(false);
    expect(hasPermission(granted, PERMISSIONS.PURCHASES_RECEIVE)).toBe(false);
    expect(hasPermission(granted, PERMISSIONS.FINANCE_VIEW)).toBe(true);
  });

  it('solo el administrador gestiona usuarios y roles', () => {
    for (const role of ROLE_LIST) {
      const canManage = hasPermission(ROLE_PERMISSIONS[role], PERMISSIONS.USERS_MANAGE);
      expect(canManage).toBe(role === 'ADMIN');
    }
  });

  it('el gerente cubre toda la operación pero no la administración de usuarios', () => {
    const granted = permissionsForRole('MANAGER');
    expect(hasAllPermissions(granted, [PERMISSIONS.SALES_CREATE, PERMISSIONS.PURCHASES_RECEIVE])).toBe(
      true,
    );
    expect(hasPermission(granted, PERMISSIONS.USERS_MANAGE)).toBe(false);
  });
});

describe('utilidades de verificación', () => {
  it('reconoce roles válidos', () => {
    expect(isRole('ADMIN')).toBe(true);
    expect(isRole('SUPERUSER')).toBe(false);
  });

  it('devuelve una lista vacía para roles desconocidos', () => {
    expect(permissionsForRole('DESCONOCIDO')).toEqual([]);
  });

  it('gestiona conjuntos indefinidos sin romperse', () => {
    expect(hasPermission(undefined, PERMISSIONS.SALES_VIEW)).toBe(false);
    expect(hasAnyPermission(undefined, [PERMISSIONS.SALES_VIEW])).toBe(false);
    expect(hasAllPermissions(undefined, [PERMISSIONS.SALES_VIEW])).toBe(false);
  });
});
