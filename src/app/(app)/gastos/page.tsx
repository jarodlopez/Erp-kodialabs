import Link from 'next/link';
import type { Metadata } from 'next';
import { Receipt, Repeat } from 'lucide-react';

import { Money, PaymentStatusBadge } from '@/components/domain/indicators';
import { CursorPagination, DateRangeFilter, FilterBar } from '@/components/ui/data-table';
import {
  Badge,
  Button,
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
import { expenseCategoryRepository, expenseRepository } from '@/lib/repositories/documents';
import { accountRepository } from '@/lib/repositories/finance';
import { organizationRepository } from '@/lib/repositories/organization';
import { formatDate } from '@/lib/utils';
import { ExpenseManager } from './expense-manager';
import { ExpenseRowActions } from './expense-row-actions';

export const metadata: Metadata = { title: 'Gastos' };
export const dynamic = 'force-dynamic';

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.EXPENSES_VIEW);
  const params = await searchParams;

  const [settings, categories, accounts, page] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    expenseCategoryRepository.list(session.organizationId),
    accountRepository.list(session.organizationId),
    expenseRepository.list(
      session.organizationId,
      {
        categoryId: params.categoria ?? null,
        from: params.from ?? null,
        to: params.to ?? null,
        status: params.estado ?? null,
      },
      { cursor: params.cursor ?? null, limit: 25 },
    ),
  ]);

  const currency = settings.currency;
  const canCreate = session.permissions.includes(PERMISSIONS.EXPENSES_CREATE);
  const pageTotal = page.items
    .filter((expense) => expense.status === 'REGISTERED')
    .reduce((acc, expense) => acc + expense.total, 0);

  return (
    <>
      <PageHeader
        title="Gastos"
        description="Egresos operativos con su categoría, estado de pago y comprobantes."
        actions={
          <div className="flex gap-2">
            <Link href="/gastos/recurrentes">
              <Button variant="secondary">
                <Repeat className="h-4 w-4" /> Recurrentes
              </Button>
            </Link>
            {canCreate && accounts.length > 0 && (
              <ExpenseManager categories={categories} accounts={accounts} currency={currency} />
            )}
          </div>
        }
      />

      <Card>
        <CardHeader
          title="Registro de gastos"
          description={`Total de esta página: ${new Intl.NumberFormat('es-NI', {
            style: 'currency',
            currency,
          }).format(pageTotal / 100)}`}
        />

        <FilterBar
          searchPlaceholder="Filtra por categoría y fechas"
          filters={[
            {
              name: 'categoria',
              label: 'Todas las categorías',
              options: categories.map((c) => ({ value: c.id, label: c.name })),
            },
            {
              name: 'estado',
              label: 'Estado',
              options: [
                { value: 'REGISTERED', label: 'Registrados' },
                { value: 'CANCELLED', label: 'Anulados' },
              ],
            },
          ]}
        >
          <DateRangeFilter />
        </FilterBar>

        {page.items.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-5 w-5" />}
            title="Sin gastos registrados"
            description="Registra alquiler, servicios, salarios y demás egresos para calcular la utilidad neta."
          />
        ) : (
          <>
            <TableWrapper>
              <thead>
                <tr>
                  <Th>Número</Th>
                  <Th>Descripción</Th>
                  <Th>Categoría</Th>
                  <Th>Cuenta</Th>
                  <Th>Estado</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((expense) => (
                  <Tr key={expense.id}>
                    <Td>
                      <span className="font-medium">{expense.number}</span>
                      <p className="text-xs text-[var(--color-ink-subtle)]">
                        {formatDate(expense.date)}
                      </p>
                    </Td>
                    <Td className="max-w-[240px]">
                      <p className="truncate">{expense.description}</p>
                      {expense.supplierName && (
                        <p className="truncate text-xs text-[var(--color-ink-subtle)]">
                          {expense.supplierName}
                        </p>
                      )}
                    </Td>
                    <Td>
                      <Badge>{expense.categoryName}</Badge>
                    </Td>
                    <Td className="text-[var(--color-ink-muted)]">{expense.accountName ?? '—'}</Td>
                    <Td>
                      {expense.status === 'CANCELLED' ? (
                        <Badge tone="neutral">Anulado</Badge>
                      ) : (
                        <PaymentStatusBadge status={expense.paymentStatus} />
                      )}
                    </Td>
                    <Td align="right">
                      <Money value={expense.total} currency={currency} />
                      {expense.dueAmount > 0 && expense.status !== 'CANCELLED' && (
                        <p className="text-xs text-[var(--color-warning-700)]">
                          Pendiente: <Money value={expense.dueAmount} currency={currency} />
                        </p>
                      )}
                    </Td>
                    <Td align="right">
                      <ExpenseRowActions
                        expense={expense}
                        accounts={accounts}
                        currency={currency}
                        canPay={session.permissions.includes(PERMISSIONS.EXPENSES_UPDATE)}
                        canCancel={session.permissions.includes(PERMISSIONS.EXPENSES_CANCEL)}
                      />
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
