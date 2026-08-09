import 'server-only';

import type { Query } from 'firebase-admin/firestore';

import type { Id, Page } from '@/types/common';
import type { InventoryMovement, InventoryMovementType } from '@/types/inventory';
import type { AuditLog } from '@/types/audit';
import {
  collectQuery,
  endOfDayIso,
  paginateQuery,
  startOfDayIso,
  type PaginationOptions,
} from './base';
import { refs } from './refs';

export interface MovementFilters {
  productId?: string | null;
  type?: InventoryMovementType | null;
  from?: string | null;
  to?: string | null;
  warehouseId?: string | null;
}

export const inventoryRepository = {
  async listMovements(
    organizationId: Id,
    filters: MovementFilters = {},
    pagination: PaginationOptions = {},
  ): Promise<Page<InventoryMovement>> {
    let query: Query = refs.inventoryMovements().where('organizationId', '==', organizationId);
    if (filters.productId) query = query.where('productId', '==', filters.productId);
    if (filters.type) query = query.where('type', '==', filters.type);
    if (filters.warehouseId) query = query.where('warehouseId', '==', filters.warehouseId);
    if (filters.from) query = query.where('createdAt', '>=', startOfDayIso(filters.from));
    if (filters.to) query = query.where('createdAt', '<=', endOfDayIso(filters.to));
    query = query.orderBy('createdAt', 'desc').orderBy('__name__', 'desc');
    return paginateQuery<InventoryMovement>(query, pagination, ['createdAt', '__name__']);
  },

  async byProduct(organizationId: Id, productId: Id, max = 50): Promise<InventoryMovement[]> {
    return collectQuery<InventoryMovement>(
      refs
        .inventoryMovements()
        .where('organizationId', '==', organizationId)
        .where('productId', '==', productId)
        .orderBy('createdAt', 'desc'),
      max,
    );
  },

  async inRange(organizationId: Id, from: string, to: string): Promise<InventoryMovement[]> {
    return collectQuery<InventoryMovement>(
      refs
        .inventoryMovements()
        .where('organizationId', '==', organizationId)
        .where('createdAt', '>=', startOfDayIso(from))
        .where('createdAt', '<=', endOfDayIso(to))
        .orderBy('createdAt', 'desc'),
      5000,
    );
  },
};

export interface AuditFilters {
  userId?: string | null;
  module?: string | null;
  action?: string | null;
  entityId?: string | null;
  from?: string | null;
  to?: string | null;
}

export const auditRepository = {
  async list(
    organizationId: Id,
    filters: AuditFilters = {},
    pagination: PaginationOptions = {},
  ): Promise<Page<AuditLog>> {
    let query: Query = refs.auditLogs().where('organizationId', '==', organizationId);
    if (filters.userId) query = query.where('userId', '==', filters.userId);
    if (filters.module) query = query.where('module', '==', filters.module);
    if (filters.action) query = query.where('action', '==', filters.action);
    if (filters.entityId) query = query.where('entityId', '==', filters.entityId);
    if (filters.from) query = query.where('timestamp', '>=', startOfDayIso(filters.from));
    if (filters.to) query = query.where('timestamp', '<=', endOfDayIso(filters.to));
    query = query.orderBy('timestamp', 'desc').orderBy('__name__', 'desc');
    return paginateQuery<AuditLog>(query, pagination, ['timestamp', '__name__']);
  },

  async byEntity(organizationId: Id, entityId: Id, max = 50): Promise<AuditLog[]> {
    return collectQuery<AuditLog>(
      refs
        .auditLogs()
        .where('organizationId', '==', organizationId)
        .where('entityId', '==', entityId)
        .orderBy('timestamp', 'desc'),
      max,
    );
  },
};
