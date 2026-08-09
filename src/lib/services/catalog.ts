import 'server-only';

/**
 * Servicio de catálogo: categorías y productos.
 *
 * Los productos con historial NUNCA se eliminan físicamente: se desactivan
 * (`status = INACTIVE`) conservando su trazabilidad en ventas, compras y
 * movimientos de inventario.
 */
import { COLLECTIONS } from '@/lib/firebase/collections';
import { errors } from '@/lib/errors';
import { toMinorUnits, toScaledQty } from '@/lib/money';
import { categoryRepository, productRepository } from '@/lib/repositories/catalog';
import { normalizeSearch, nowIso } from '@/lib/repositories/base';
import { newDoc, refs } from '@/lib/repositories/refs';
import { audit } from './audit';
import { runTransaction } from './transaction';
import type { ActorContext, Id } from '@/types/common';
import type { Category, Product, ProductUnit } from '@/types/catalog';

export interface CategoryInput {
  name: string;
  description?: string | null;
  parentId?: Id | null;
  color?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface ProductInput {
  sku: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  categoryId?: Id | null;
  brand?: string | null;
  unit: ProductUnit;
  imageUrl?: string | null;
  imagePath?: string | null;
  cost: number;
  salePrice: number;
  wholesalePrice?: number;
  taxRate: number;
  minimumStock: number;
  tracksInventory: boolean;
  status?: 'ACTIVE' | 'INACTIVE';
  /** Existencias iniciales, solo al crear. Genera un movimiento `INITIAL`. */
  initialStock?: number;
}

export const catalogService = {
  async createCategory(actor: ActorContext, input: CategoryInput): Promise<Id> {
    const name = input.name.trim();
    const existing = await categoryRepository.findByName(actor.organizationId, name);
    if (existing) throw errors.conflict('Ya existe una categoría con ese nombre.');

    const ref = newDoc(COLLECTIONS.CATEGORIES);
    const category: Category = {
      id: ref.id,
      organizationId: actor.organizationId,
      name,
      description: input.description ?? null,
      parentId: input.parentId ?? null,
      color: input.color ?? null,
      status: input.status ?? 'ACTIVE',
      productCount: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: actor.userId,
      updatedBy: actor.userId,
    };
    await ref.create(category);

    await audit(actor, {
      action: 'CREATE',
      module: 'CATALOG',
      entityType: 'category',
      entityId: ref.id,
      entityLabel: name,
      after: { name, status: category.status },
    });
    return ref.id;
  },

  async updateCategory(actor: ActorContext, id: Id, input: CategoryInput): Promise<void> {
    const current = await categoryRepository.require(actor.organizationId, id);
    const name = input.name.trim();

    if (name !== current.name) {
      const existing = await categoryRepository.findByName(actor.organizationId, name);
      if (existing && existing.id !== id) {
        throw errors.conflict('Ya existe una categoría con ese nombre.');
      }
    }

    // No se permite desactivar una categoría que aún tiene productos activos.
    if (input.status === 'INACTIVE' && current.status === 'ACTIVE') {
      const count = await categoryRepository.countProducts(actor.organizationId, id);
      if (count > 0) {
        throw errors.dependencyExists(
          `La categoría tiene ${count} producto(s) asociado(s). Reasígnalos antes de desactivarla.`,
        );
      }
    }

    await refs.category(id).set(
      {
        name,
        description: input.description ?? null,
        parentId: input.parentId ?? null,
        color: input.color ?? null,
        status: input.status ?? current.status,
        updatedAt: nowIso(),
        updatedBy: actor.userId,
      },
      { merge: true },
    );

    await audit(actor, {
      action: 'UPDATE',
      module: 'CATALOG',
      entityType: 'category',
      entityId: id,
      entityLabel: name,
      before: { name: current.name, status: current.status },
      after: { name, status: input.status ?? current.status },
    });
  },

  async createProduct(actor: ActorContext, input: ProductInput, warehouseId: Id): Promise<Id> {
    const sku = input.sku.trim().toUpperCase();
    const existing = await productRepository.findBySku(actor.organizationId, sku);
    if (existing) throw errors.conflict(`Ya existe un producto con el SKU "${sku}".`);

    if (input.barcode) {
      const byBarcode = await productRepository.findByBarcode(actor.organizationId, input.barcode);
      if (byBarcode) throw errors.conflict('Ya existe un producto con ese código de barras.');
    }

    const category = input.categoryId
      ? await categoryRepository.require(actor.organizationId, input.categoryId)
      : null;

    const cost = toMinorUnits(input.cost);
    const initialStock = toScaledQty(input.initialStock ?? 0);
    const minimumStock = toScaledQty(input.minimumStock);

    const ref = newDoc(COLLECTIONS.PRODUCTS);
    const product: Product = {
      id: ref.id,
      organizationId: actor.organizationId,
      sku,
      barcode: input.barcode?.trim() || null,
      name: input.name.trim(),
      searchName: normalizeSearch(input.name),
      description: input.description ?? null,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      brand: input.brand ?? null,
      unit: input.unit,
      imageUrl: input.imageUrl ?? null,
      imagePath: input.imagePath ?? null,
      cost,
      averageCost: cost,
      salePrice: toMinorUnits(input.salePrice),
      wholesalePrice: toMinorUnits(input.wholesalePrice ?? 0),
      taxRate: input.taxRate,
      stock: 0,
      minimumStock,
      isLowStock: initialStock <= minimumStock,
      tracksInventory: input.tracksInventory,
      status: input.status ?? 'ACTIVE',
      deletedAt: null,
      deletedBy: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: actor.userId,
      updatedBy: actor.userId,
    };

    await runTransaction(async (tx) => {
      tx.create(ref, product);

      if (initialStock > 0 && input.tracksInventory) {
        // El inventario inicial también genera su movimiento trazable.
        const movementRef = newDoc(COLLECTIONS.INVENTORY_MOVEMENTS);
        tx.set(ref, { stock: initialStock, isLowStock: initialStock <= minimumStock }, { merge: true });
        tx.set(
          refs.productStock(actor.organizationId, ref.id, warehouseId),
          {
            organizationId: actor.organizationId,
            productId: ref.id,
            warehouseId,
            quantity: initialStock,
            updatedAt: nowIso(),
          },
          { merge: true },
        );
        tx.create(movementRef, {
          id: movementRef.id,
          organizationId: actor.organizationId,
          productId: ref.id,
          productName: product.name,
          productSku: product.sku,
          warehouseId,
          type: 'INITIAL',
          quantity: initialStock,
          signedQuantity: initialStock,
          previousStock: 0,
          newStock: initialStock,
          unitCost: cost,
          totalCost: Math.round((cost * initialStock) / 1000),
          referenceType: 'OPENING',
          referenceId: ref.id,
          referenceNumber: null,
          reason: 'Inventario inicial',
          createdBy: actor.userId,
          createdByName: actor.email,
          createdAt: nowIso(),
        });
      }

      if (category) {
        tx.set(
          refs.category(category.id),
          { productCount: category.productCount + 1, updatedAt: nowIso() },
          { merge: true },
        );
      }
    });

    await audit(actor, {
      action: 'CREATE',
      module: 'CATALOG',
      entityType: 'product',
      entityId: ref.id,
      entityLabel: `${sku} — ${product.name}`,
      after: { sku, name: product.name, salePrice: product.salePrice, initialStock },
    });

    return ref.id;
  },

  async updateProduct(actor: ActorContext, id: Id, input: ProductInput): Promise<void> {
    const current = await productRepository.require(actor.organizationId, id);
    const sku = input.sku.trim().toUpperCase();

    if (sku !== current.sku) {
      const existing = await productRepository.findBySku(actor.organizationId, sku);
      if (existing && existing.id !== id) {
        throw errors.conflict(`Ya existe un producto con el SKU "${sku}".`);
      }
    }

    const category = input.categoryId
      ? await categoryRepository.require(actor.organizationId, input.categoryId)
      : null;

    const minimumStock = toScaledQty(input.minimumStock);

    await refs.product(id).set(
      {
        sku,
        barcode: input.barcode?.trim() || null,
        name: input.name.trim(),
        searchName: normalizeSearch(input.name),
        description: input.description ?? null,
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? null,
        brand: input.brand ?? null,
        unit: input.unit,
        imageUrl: input.imageUrl ?? current.imageUrl,
        imagePath: input.imagePath ?? current.imagePath,
        // `cost` y `averageCost` NO se editan a mano: los define el flujo de
        // compras mediante el costo promedio ponderado.
        salePrice: toMinorUnits(input.salePrice),
        wholesalePrice: toMinorUnits(input.wholesalePrice ?? 0),
        taxRate: input.taxRate,
        minimumStock,
        isLowStock: current.stock <= minimumStock,
        tracksInventory: input.tracksInventory,
        status: input.status ?? current.status,
        updatedAt: nowIso(),
        updatedBy: actor.userId,
      },
      { merge: true },
    );

    await audit(actor, {
      action: 'UPDATE',
      module: 'CATALOG',
      entityType: 'product',
      entityId: id,
      entityLabel: `${sku} — ${input.name}`,
      before: { name: current.name, salePrice: current.salePrice, status: current.status },
      after: { name: input.name, salePrice: toMinorUnits(input.salePrice), status: input.status },
    });
  },

  /** Desactiva un producto. No se elimina para conservar el historial. */
  async setProductStatus(
    actor: ActorContext,
    id: Id,
    status: 'ACTIVE' | 'INACTIVE',
  ): Promise<void> {
    const current = await productRepository.require(actor.organizationId, id);
    await refs.product(id).set(
      {
        status,
        deletedAt: status === 'INACTIVE' ? nowIso() : null,
        deletedBy: status === 'INACTIVE' ? actor.userId : null,
        updatedAt: nowIso(),
        updatedBy: actor.userId,
      },
      { merge: true },
    );

    await audit(actor, {
      action: 'UPDATE',
      module: 'CATALOG',
      entityType: 'product',
      entityId: id,
      entityLabel: `${current.sku} — ${current.name}`,
      before: { status: current.status },
      after: { status },
    });
  },
};
