'use server';

import { revalidatePath } from 'next/cache';

import { fail, logError, ok, type ActionResult } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/rbac';
import { customerRepository, supplierRepository } from '@/lib/repositories/parties';
import { getActorContext } from '@/lib/server-context';
import { partyService } from '@/lib/services/parties';
import { parseOrThrow } from '@/lib/validation/parse';
import { customerSchema, supplierSchema } from '@/lib/validation/schemas';
import type { Customer, Supplier } from '@/types/parties';

export async function createCustomerAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.CUSTOMERS_CREATE);
    const data = parseOrThrow(customerSchema, input);
    const id = await partyService.createCustomer(actor, data);
    revalidatePath('/clientes');
    return ok({ id });
  } catch (error) {
    logError('parties.createCustomer', error);
    return fail(error);
  }
}

export async function updateCustomerAction(
  id: string,
  input: unknown,
): Promise<ActionResult<undefined>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.CUSTOMERS_UPDATE);
    const data = parseOrThrow(customerSchema, input);
    await partyService.updateCustomer(actor, id, data);
    revalidatePath('/clientes');
    revalidatePath(`/clientes/${id}`);
    return ok();
  } catch (error) {
    logError('parties.updateCustomer', error);
    return fail(error);
  }
}

export async function createSupplierAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.SUPPLIERS_CREATE);
    const data = parseOrThrow(supplierSchema, input);
    const id = await partyService.createSupplier(actor, data);
    revalidatePath('/proveedores');
    return ok({ id });
  } catch (error) {
    logError('parties.createSupplier', error);
    return fail(error);
  }
}

export async function updateSupplierAction(
  id: string,
  input: unknown,
): Promise<ActionResult<undefined>> {
  try {
    const { actor } = await getActorContext(PERMISSIONS.SUPPLIERS_UPDATE);
    const data = parseOrThrow(supplierSchema, input);
    await partyService.updateSupplier(actor, id, data);
    revalidatePath('/proveedores');
    revalidatePath(`/proveedores/${id}`);
    return ok();
  } catch (error) {
    logError('parties.updateSupplier', error);
    return fail(error);
  }
}

export async function searchCustomersAction(term: string): Promise<ActionResult<Customer[]>> {
  try {
    const { session } = await getActorContext(PERMISSIONS.CUSTOMERS_VIEW);
    return ok(await customerRepository.quickSearch(session.organizationId, term, 12));
  } catch (error) {
    return fail(error);
  }
}

export async function searchSuppliersAction(term: string): Promise<ActionResult<Supplier[]>> {
  try {
    const { session } = await getActorContext(PERMISSIONS.SUPPLIERS_VIEW);
    return ok(await supplierRepository.quickSearch(session.organizationId, term, 12));
  } catch (error) {
    return fail(error);
  }
}
