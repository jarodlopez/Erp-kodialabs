import 'server-only';

/**
 * Servicio de clientes y proveedores.
 * Las métricas (`stats`) no se editan aquí: las mantiene el flujo de ventas,
 * compras y pagos dentro de sus transacciones.
 */
import { COLLECTIONS } from '@/lib/firebase/collections';
import { errors } from '@/lib/errors';
import { toMinorUnits } from '@/lib/money';
import { normalizeSearch, nowIso } from '@/lib/repositories/base';
import { customerRepository, supplierRepository } from '@/lib/repositories/parties';
import { newDoc, refs } from '@/lib/repositories/refs';
import { audit } from './audit';
import type { ActorContext, Id } from '@/types/common';
import type { Customer, DocumentType, Supplier } from '@/types/parties';
import { EMPTY_PARTY_STATS } from '@/types/parties';

export interface CustomerInput {
  name: string;
  documentType?: DocumentType | null;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  creditLimit?: number;
  creditDays?: number;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface SupplierInput {
  name: string;
  documentType?: DocumentType | null;
  document?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  creditDays?: number;
  status?: 'ACTIVE' | 'INACTIVE';
}

export const partyService = {
  async createCustomer(actor: ActorContext, input: CustomerInput): Promise<Id> {
    if (input.document) {
      const existing = await customerRepository.findByDocument(actor.organizationId, input.document);
      if (existing) throw errors.conflict('Ya existe un cliente con ese documento.');
    }

    const ref = newDoc(COLLECTIONS.CUSTOMERS);
    const customer: Customer = {
      id: ref.id,
      organizationId: actor.organizationId,
      name: input.name.trim(),
      searchName: normalizeSearch(input.name),
      documentType: input.documentType ?? null,
      document: input.document?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      address: input.address ?? null,
      notes: input.notes ?? null,
      creditLimit: toMinorUnits(input.creditLimit ?? 0),
      creditDays: input.creditDays ?? 30,
      status: input.status ?? 'ACTIVE',
      stats: { ...EMPTY_PARTY_STATS },
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: actor.userId,
      updatedBy: actor.userId,
    };
    await ref.create(customer);

    await audit(actor, {
      action: 'CREATE',
      module: 'PARTIES',
      entityType: 'customer',
      entityId: ref.id,
      entityLabel: customer.name,
      after: { name: customer.name, document: customer.document },
    });
    return ref.id;
  },

  async updateCustomer(actor: ActorContext, id: Id, input: CustomerInput): Promise<void> {
    const current = await customerRepository.require(actor.organizationId, id);

    await refs.customer(id).set(
      {
        name: input.name.trim(),
        searchName: normalizeSearch(input.name),
        documentType: input.documentType ?? null,
        document: input.document?.trim() || null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim().toLowerCase() || null,
        address: input.address ?? null,
        notes: input.notes ?? null,
        creditLimit: toMinorUnits(input.creditLimit ?? 0),
        creditDays: input.creditDays ?? current.creditDays,
        status: input.status ?? current.status,
        updatedAt: nowIso(),
        updatedBy: actor.userId,
      },
      { merge: true },
    );

    await audit(actor, {
      action: 'UPDATE',
      module: 'PARTIES',
      entityType: 'customer',
      entityId: id,
      entityLabel: input.name,
      before: { name: current.name, status: current.status },
      after: { name: input.name, status: input.status ?? current.status },
    });
  },

  async createSupplier(actor: ActorContext, input: SupplierInput): Promise<Id> {
    const ref = newDoc(COLLECTIONS.SUPPLIERS);
    const supplier: Supplier = {
      id: ref.id,
      organizationId: actor.organizationId,
      name: input.name.trim(),
      searchName: normalizeSearch(input.name),
      documentType: input.documentType ?? null,
      document: input.document?.trim() || null,
      contactName: input.contactName ?? null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      address: input.address ?? null,
      notes: input.notes ?? null,
      creditDays: input.creditDays ?? 30,
      status: input.status ?? 'ACTIVE',
      stats: { ...EMPTY_PARTY_STATS },
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: actor.userId,
      updatedBy: actor.userId,
    };
    await ref.create(supplier);

    await audit(actor, {
      action: 'CREATE',
      module: 'PARTIES',
      entityType: 'supplier',
      entityId: ref.id,
      entityLabel: supplier.name,
      after: { name: supplier.name },
    });
    return ref.id;
  },

  async updateSupplier(actor: ActorContext, id: Id, input: SupplierInput): Promise<void> {
    const current = await supplierRepository.require(actor.organizationId, id);

    await refs.supplier(id).set(
      {
        name: input.name.trim(),
        searchName: normalizeSearch(input.name),
        documentType: input.documentType ?? null,
        document: input.document?.trim() || null,
        contactName: input.contactName ?? null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim().toLowerCase() || null,
        address: input.address ?? null,
        notes: input.notes ?? null,
        creditDays: input.creditDays ?? current.creditDays,
        status: input.status ?? current.status,
        updatedAt: nowIso(),
        updatedBy: actor.userId,
      },
      { merge: true },
    );

    await audit(actor, {
      action: 'UPDATE',
      module: 'PARTIES',
      entityType: 'supplier',
      entityId: id,
      entityLabel: input.name,
      before: { name: current.name, status: current.status },
      after: { name: input.name, status: input.status ?? current.status },
    });
  },
};
