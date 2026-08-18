import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ExternalLink,
  Image as ImageIcon,
  Palette,
  ShoppingBag,
  Store,
  Tag,
} from 'lucide-react';

import { Money, SummaryTile } from '@/components/domain/indicators';
import { Badge, Button, Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import { PERMISSIONS } from '@/lib/rbac';
import { organizationRepository } from '@/lib/repositories/organization';
import {
  storeDiscountRepository,
  storeListingRepository,
  storeOrderRepository,
} from '@/lib/repositories/store';
import { getActorContext } from '@/lib/server-context';
import { storeService } from '@/lib/services/store';
import { storeUrl } from '@/lib/storefront';
import { daysAgoIso, formatDate } from '@/lib/utils';
import { STORE_ORDER_STATUS_LABELS, STORE_STATUS_LABELS } from '@/types/store';

export const metadata: Metadata = { title: 'Tienda online' };
export const dynamic = 'force-dynamic';

/**
 * Resumen del módulo de tienda.
 *
 * Entrar aquí es lo que da de alta la tienda: `ensureSettings` la crea en
 * borrador con valores neutros la primera vez, de modo que el comercio nunca
 * se topa con una pantalla de configuración vacía ni con una tienda a medio
 * hacer publicada por accidente.
 */
export default async function StoreOverviewPage() {
  const { session, actor } = await getActorContext(PERMISSIONS.STORE_VIEW);

  const settings = await storeService.ensureSettings(actor);

  const thirtyDaysAgo = daysAgoIso(30);

  const [orgSettings, listings, visibleListings, pending, approved, discounts, recent] =
    await Promise.all([
      organizationRepository.getSettings(session.organizationId),
      storeListingRepository.count(session.organizationId),
      storeListingRepository.count(session.organizationId, true),
      storeOrderRepository.countByStatus(session.organizationId, 'PENDING'),
      storeOrderRepository.approvedSince(session.organizationId, thirtyDaysAgo),
      storeDiscountRepository.count(session.organizationId),
      storeOrderRepository.list(session.organizationId, {}, { limit: 6 }),
    ]);

  const canManage = session.permissions.includes(PERMISSIONS.STORE_MANAGE);
  const published = settings.status === 'PUBLISHED';
  const publicHref = `/t/${settings.slug}`;
  const shareUrl = storeUrl(settings.slug);

  const soldLast30 = approved.reduce((acc, order) => acc + order.total, 0);

  return (
    <>
      <PageHeader
        title="Tienda online"
        description="Vende por internet el mismo catálogo del ERP. Cada pedido aprobado se convierte en una venta con su inventario y su asiento."
        actions={
          <div className="flex flex-wrap gap-2">
            <a href={publicHref} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary">
                <ExternalLink className="h-4 w-4" /> Ver tienda
              </Button>
            </a>
            {canManage && (
              <Link href="/tienda/diseno">
                <Button>
                  <Palette className="h-4 w-4" /> Configurar
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <Card className="mb-4">
        <CardHeader
          title={settings.branding.name}
          description={
            published
              ? 'La tienda está abierta y recibiendo pedidos.'
              : 'La tienda está en borrador: solo vos podés verla. Publicala desde Diseño cuando esté lista.'
          }
          actions={
            <Badge tone={published ? 'positive' : 'neutral'}>
              {STORE_STATUS_LABELS[settings.status]}
            </Badge>
          }
        />
        <div className="px-5 pb-5">
          <p className="text-sm text-[var(--color-ink-muted)]">
            Dirección pública:{' '}
            <span className="font-mono text-[var(--color-ink)]">{shareUrl || publicHref}</span>
          </p>
        </div>
      </Card>

      <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          variant={pending > 0 ? 'sun' : undefined}
          label="Pedidos por revisar"
          value={String(pending)}
          hint="Esperan aprobación para volverse venta"
          icon={<ShoppingBag className="h-4 w-4" />}
        />
        <SummaryTile
          variant="positive"
          label="Vendido en 30 días"
          value={<Money value={soldLast30} currency={orgSettings.currency} />}
          hint={`${approved.length} pedido(s) aprobado(s)`}
        />
        <SummaryTile
          label="Productos en vitrina"
          value={`${visibleListings} / ${listings}`}
          hint="Visibles sobre publicados"
          icon={<ImageIcon className="h-4 w-4" />}
        />
        <SummaryTile
          label="Cupones activos"
          value={String(discounts)}
          icon={<Tag className="h-4 w-4" />}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Últimos pedidos"
            description="Los pedidos web no tocan inventario hasta que se aprueban."
            actions={
              <Link href="/tienda/pedidos">
                <Button variant="ghost" size="sm">
                  Ver todos
                </Button>
              </Link>
            }
          />
          {recent.items.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-[var(--color-ink-muted)]">
              Todavía no hay pedidos. Compartí el enlace de tu tienda para empezar a recibirlos.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {recent.items.map((order) => (
                <li key={order.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/tienda/pedidos/${order.id}`}
                      className="font-medium text-[var(--color-brand-600)] hover:underline"
                    >
                      {order.number}
                    </Link>
                    <p className="truncate text-xs text-[var(--color-ink-subtle)]">
                      {order.customer.name} · {formatDate(order.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge tone={order.status === 'PENDING' ? 'warning' : 'neutral'}>
                      {STORE_ORDER_STATUS_LABELS[order.status]}
                    </Badge>
                    <Money value={order.total} currency={orgSettings.currency} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Atajos" />
          <div className="space-y-2 px-5 pb-5">
            <ShortcutLink href="/tienda/catalogo" icon={<Store className="h-4 w-4" />}>
              Publicar productos en la vitrina
            </ShortcutLink>
            <ShortcutLink href="/tienda/pedidos" icon={<ShoppingBag className="h-4 w-4" />}>
              Revisar pedidos pendientes
            </ShortcutLink>
            {canManage && (
              <>
                <ShortcutLink href="/tienda/diseno" icon={<Palette className="h-4 w-4" />}>
                  Marca, envíos y datos de pago
                </ShortcutLink>
                <ShortcutLink href="/tienda/descuentos" icon={<Tag className="h-4 w-4" />}>
                  Cupones de descuento
                </ShortcutLink>
              </>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function ShortcutLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-surface-muted)]"
    >
      <span className="text-[var(--color-ink-subtle)]">{icon}</span>
      {children}
    </Link>
  );
}
