import type { Metadata } from 'next';
import { ScrollText } from 'lucide-react';

import { CursorPagination, DateRangeFilter, FilterBar } from '@/components/ui/data-table';
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
import { requirePermission } from '@/lib/auth/session';
import { PERMISSIONS } from '@/lib/rbac';
import { auditRepository } from '@/lib/repositories/inventory';
import { formatDateTime } from '@/lib/utils';
import { AUDIT_ACTION_LABELS } from '@/types/audit';

export const metadata: Metadata = { title: 'Auditoría' };
export const dynamic = 'force-dynamic';

const MODULES = [
  'AUTH',
  'SALES',
  'PURCHASES',
  'EXPENSES',
  'INVENTORY',
  'FINANCE',
  'CATALOG',
  'PARTIES',
  'ADMIN',
  'REPORTS',
  'SYSTEM',
];

const ACTION_TONE: Record<string, 'neutral' | 'brand' | 'positive' | 'warning' | 'danger'> = {
  CREATE: 'positive',
  CONFIRM: 'positive',
  RECEIVE: 'positive',
  UPDATE: 'brand',
  PAYMENT: 'brand',
  EXPORT: 'neutral',
  LOGIN: 'neutral',
  LOGOUT: 'neutral',
  CRON: 'neutral',
  ADJUSTMENT: 'warning',
  TRANSFER: 'warning',
  RETURN: 'warning',
  ROLE_CHANGE: 'warning',
  CANCEL: 'danger',
  DELETE: 'danger',
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.AUDIT_VIEW);
  const params = await searchParams;

  const page = await auditRepository.list(
    session.organizationId,
    {
      module: params.modulo ?? null,
      action: params.accion ?? null,
      from: params.from ?? null,
      to: params.to ?? null,
    },
    { cursor: params.cursor ?? null, limit: 40 },
  );

  return (
    <>
      <PageHeader
        title="Auditoría"
        description="Registro inmutable de las operaciones sensibles. Ningún usuario puede modificar ni borrar estos eventos."
      />

      <Card>
        <CardHeader title="Bitácora" />
        <FilterBar
          searchPlaceholder="Filtra por módulo, acción y fechas"
          filters={[
            {
              name: 'modulo',
              label: 'Todos los módulos',
              options: MODULES.map((value) => ({ value, label: value })),
            },
            {
              name: 'accion',
              label: 'Todas las acciones',
              options: Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({
                value,
                label,
              })),
            },
          ]}
        >
          <DateRangeFilter />
        </FilterBar>

        {page.items.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="h-5 w-5" />}
            title="Sin eventos"
            description="No hay registros de auditoría para los filtros seleccionados."
          />
        ) : (
          <>
            <TableWrapper>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Usuario</Th>
                  <Th>Acción</Th>
                  <Th>Módulo</Th>
                  <Th>Entidad</Th>
                  <Th>Detalle</Th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((log) => (
                  <Tr key={log.id}>
                    <Td className="whitespace-nowrap text-xs">{formatDateTime(log.timestamp)}</Td>
                    <Td className="max-w-[180px] truncate">{log.userEmail}</Td>
                    <Td>
                      <Badge tone={ACTION_TONE[log.action] ?? 'neutral'}>
                        {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                      </Badge>
                    </Td>
                    <Td className="text-[var(--color-ink-muted)]">{log.module}</Td>
                    <Td>
                      <span className="text-sm">{log.entityLabel ?? log.entityType}</span>
                      <p className="font-mono text-xs text-[var(--color-ink-subtle)]">
                        {log.entityType}
                      </p>
                    </Td>
                    <Td className="max-w-[280px]">
                      <details>
                        <summary className="cursor-pointer text-xs text-[var(--color-brand-600)]">
                          Ver cambios
                        </summary>
                        <div className="mt-1.5 space-y-1 text-xs">
                          {log.before && (
                            <p className="break-all text-[var(--color-ink-subtle)]">
                              <strong>Antes:</strong> {JSON.stringify(log.before)}
                            </p>
                          )}
                          {log.after && (
                            <p className="break-all text-[var(--color-ink-subtle)]">
                              <strong>Después:</strong> {JSON.stringify(log.after)}
                            </p>
                          )}
                          {log.metadata && (
                            <p className="break-all text-[var(--color-ink-subtle)]">
                              <strong>Datos:</strong> {JSON.stringify(log.metadata)}
                            </p>
                          )}
                        </div>
                      </details>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrapper>

            <CursorPagination
              nextCursor={page.nextCursor}
              hasMore={page.hasMore}
              count={page.items.length}
            />
          </>
        )}
      </Card>
    </>
  );
}
