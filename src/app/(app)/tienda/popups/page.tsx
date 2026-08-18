import Link from 'next/link';
import type { Metadata } from 'next';
import { MessageSquare } from 'lucide-react';

import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from '@/components/ui/primitives';
import { requirePermission } from '@/lib/auth/session';
import { optimizeImg } from '@/lib/images';
import { PERMISSIONS } from '@/lib/rbac';
import { storeBannerRepository } from '@/lib/repositories/store';
import { formatDate } from '@/lib/utils';
import { BannerEditor } from './banner-editor';

export const metadata: Metadata = { title: 'Pop-ups · Tienda' };
export const dynamic = 'force-dynamic';

export default async function StorePopupsPage() {
  const session = await requirePermission(PERMISSIONS.STORE_MANAGE);
  const banners = await storeBannerRepository.list(session.organizationId);

  return (
    <>
      <PageHeader
        title="Pop-ups"
        breadcrumb={
          <Link href="/tienda" className="hover:underline">
            Tienda online
          </Link>
        }
        description="Aviso emergente para promociones. Se muestra el más reciente que esté activo, una vez por visita."
        actions={<BannerEditor mode="create" />}
      />

      <Card>
        <CardHeader title={`${banners.length} pop-up(s)`} />

        {banners.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="h-5 w-5" />}
            title="Sin pop-ups"
            description="Creá uno para anunciar una promoción o un cambio de horario."
            action={<BannerEditor mode="create" />}
          />
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {banners.map((banner) => (
              <li key={banner.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                {banner.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={optimizeImg(banner.imageUrl, 400)}
                    alt={banner.title}
                    className="h-16 w-24 rounded border border-[var(--color-border)] object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-24 items-center justify-center rounded border border-dashed border-[var(--color-border-strong)] text-[var(--color-ink-subtle)]">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                )}

                <div className="min-w-[200px] flex-1">
                  <p className="font-medium">{banner.title}</p>
                  {banner.message && (
                    <p className="line-clamp-2 text-sm text-[var(--color-ink-muted)]">
                      {banner.message}
                    </p>
                  )}
                  <p className="text-xs text-[var(--color-ink-subtle)]">
                    Aparece a los {banner.delaySeconds}s · creado {formatDate(banner.createdAt)}
                  </p>
                </div>

                <Badge tone={banner.status === 'ACTIVE' ? 'positive' : 'neutral'}>
                  {banner.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                </Badge>

                <BannerEditor mode="edit" banner={banner} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
