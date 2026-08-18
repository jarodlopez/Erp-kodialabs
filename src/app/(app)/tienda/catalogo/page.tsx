import Link from 'next/link';
import type { Metadata } from 'next';
import { Boxes, Store } from 'lucide-react';

import { Money } from '@/components/domain/indicators';
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  TableWrapper,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { optimizeImg } from '@/lib/images';
import { PERMISSIONS } from '@/lib/rbac';
import { productRepository } from '@/lib/repositories/catalog';
import { organizationRepository } from '@/lib/repositories/organization';
import { storeListingRepository } from '@/lib/repositories/store';
import { getActorContext } from '@/lib/server-context';
import { listCollectionOptions, storeService } from '@/lib/services/store';
import { ListingEditor } from './listing-editor';
import { ListingVisibilityToggle } from './visibility-toggle';

export const metadata: Metadata = { title: 'Vitrina · Tienda' };
export const dynamic = 'force-dynamic';

/**
 * Vitrina: qué productos del ERP se venden por internet.
 *
 * Publicar no duplica nada. La ficha guarda solo lo que la web necesita
 * (fotos, texto de venta, oferta, orden) y apunta al producto real, así que el
 * precio y la existencia que ve el comprador salen del inventario en vivo.
 */
export default async function StoreCatalogPage() {
  const { session, actor } = await getActorContext(PERMISSIONS.STORE_VIEW);
  const canManage = session.permissions.includes(PERMISSIONS.STORE_MANAGE);

  const settings = await storeService.ensureSettings(actor);

  const [listings, orgSettings, collections, productPage] = await Promise.all([
    storeListingRepository.list(session.organizationId),
    organizationRepository.getSettings(session.organizationId),
    listCollectionOptions(session.organizationId),
    productRepository.list(session.organizationId, { status: 'ACTIVE' }, { limit: 100 }),
  ]);

  const products = productPage.items.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    salePrice: product.salePrice,
  }));

  const productsById = new Map(productPage.items.map((product) => [product.id, product]));
  const currency = orgSettings.currency;

  return (
    <>
      <PageHeader
        title="Vitrina"
        breadcrumb={
          <Link href="/tienda" className="hover:underline">
            Tienda online
          </Link>
        }
        description="Elegí qué productos del inventario se muestran en la tienda y cómo se ven."
        actions={
          canManage ? (
            <ListingEditor mode="create" products={products} collections={collections} />
          ) : undefined
        }
      />

      <Card>
        <CardHeader
          title={`${listings.length} producto(s) publicado(s)`}
          description={`Se muestran en /t/${settings.slug} ordenados por el campo "orden".`}
        />

        {listings.length === 0 ? (
          <EmptyState
            icon={<Store className="h-5 w-5" />}
            title="La vitrina está vacía"
            description="Publicá tu primer producto para que la tienda tenga qué vender."
            action={
              canManage ? (
                <ListingEditor mode="create" products={products} collections={collections} />
              ) : undefined
            }
          />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th>Colección</Th>
                <Th align="right">Precio</Th>
                <Th align="right">Existencia</Th>
                <Th>Variantes</Th>
                <Th>Estado</Th>
                {canManage && <Th align="right">Acciones</Th>}
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => {
                const product = productsById.get(listing.productId);
                const price = listing.salePrice > 0 ? listing.salePrice : product?.salePrice ?? 0;

                return (
                  <Tr key={listing.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        {listing.images[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={optimizeImg(listing.images[0], 400)}
                            alt={listing.title}
                            className="h-12 w-10 rounded border border-[var(--color-border)] object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-10 items-center justify-center rounded border border-dashed border-[var(--color-border-strong)] text-[var(--color-ink-subtle)]">
                            <Boxes className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium">{listing.title}</p>
                          <p className="text-xs text-[var(--color-ink-subtle)]">
                            {product?.sku ?? 'Producto eliminado'}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td label="Colección" className="text-[var(--color-ink-muted)]">
                      {listing.collection ?? '—'}
                    </Td>
                    <Td label="Precio" align="right">
                      <Money value={price} currency={currency} />
                      {listing.salePrice > 0 && (
                        <p className="text-xs text-[var(--color-ink-subtle)]">En oferta</p>
                      )}
                    </Td>
                    <Td label="Existencia" align="right">
                      {product ? (product.stock / 1000).toLocaleString('es-NI') : '—'}
                    </Td>
                    <Td label="Variantes">
                      {listing.variants.length > 0 ? `${listing.variants.length}` : 'Sin variantes'}
                    </Td>
                    <Td label="Estado">
                      {!product ? (
                        <Badge tone="danger">Producto ausente</Badge>
                      ) : listing.visible ? (
                        <Badge tone="positive">Visible</Badge>
                      ) : (
                        <Badge tone="neutral">Oculto</Badge>
                      )}
                    </Td>
                    {canManage && (
                      <Td align="right">
                        <div className="flex justify-end gap-1">
                          <ListingVisibilityToggle
                            productId={listing.productId}
                            visible={listing.visible}
                          />
                          <ListingEditor
                            mode="edit"
                            listing={listing}
                            products={products}
                            collections={collections}
                          />
                        </div>
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </tbody>
          </TableWrapper>
        )}
      </Card>
    </>
  );
}
