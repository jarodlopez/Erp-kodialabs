import Link from 'next/link';
import type { Metadata } from 'next';
import { Repeat } from 'lucide-react';

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
import { requirePermission } from '@/lib/auth/session';
import { PERMISSIONS } from '@/lib/rbac';
import { expenseCategoryRepository, recurringExpenseRepository } from '@/lib/repositories/documents';
import { accountRepository } from '@/lib/repositories/finance';
import { organizationRepository } from '@/lib/repositories/organization';
import { formatDate } from '@/lib/utils';
import { RECURRING_FREQUENCY_LABELS } from '@/types/expenses';
import { RecurringManager } from './recurring-manager';

export const metadata: Metadata = { title: 'Gastos recurrentes' };
export const dynamic = 'force-dynamic';

export default async function RecurringExpensesPage() {
  const session = await requirePermission(PERMISSIONS.EXPENSES_VIEW);

  const [settings, categories, accounts, items] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    expenseCategoryRepository.list(session.organizationId),
    accountRepository.list(session.organizationId),
    recurringExpenseRepository.list(session.organizationId),
  ]);

  const currency = settings.currency;
  const canCreate = session.permissions.includes(PERMISSIONS.EXPENSES_CREATE);

  return (
    <>
      <PageHeader
        title="Gastos recurrentes"
        breadcrumb={
          <Link href="/gastos" className="hover:underline">
            Gastos
          </Link>
        }
        description="Se generan automáticamente mediante una tarea programada; no dependen de que alguien abra la aplicación."
        actions={
          canCreate ? (
            <RecurringManager categories={categories} accounts={accounts} currency={currency} />
          ) : undefined
        }
      />

      <Card>
        <CardHeader
          title="Programación"
          description="La tarea diaria del servidor revisa los vencimientos y crea los gastos correspondientes."
        />

        {items.length === 0 ? (
          <EmptyState
            icon={<Repeat className="h-5 w-5" />}
            title="Sin gastos recurrentes"
            description="Programa alquiler, servicios o salarios para que se registren solos."
            action={
              canCreate ? (
                <RecurringManager categories={categories} accounts={accounts} currency={currency} />
              ) : undefined
            }
          />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Descripción</Th>
                <Th>Categoría</Th>
                <Th>Frecuencia</Th>
                <Th>Próxima</Th>
                <Th align="right">Importe</Th>
                <Th align="right">Generados</Th>
                <Th>Estado</Th>
                {canCreate && <Th align="right">Acciones</Th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <Tr key={item.id}>
                  <Td>
                    <span className="font-medium">{item.description}</span>
                    {item.autoPay && (
                      <p className="text-xs text-[var(--color-ink-subtle)]">Pago automático</p>
                    )}
                  </Td>
                  <Td>
                    <Badge>{item.categoryName}</Badge>
                  </Td>
                  <Td>{RECURRING_FREQUENCY_LABELS[item.frequency]}</Td>
                  <Td>{formatDate(item.nextDate)}</Td>
                  <Td align="right">
                    <Money value={item.amount} currency={currency} />
                  </Td>
                  <Td align="right">{item.generatedCount}</Td>
                  <Td>
                    {item.status === 'ACTIVE' ? (
                      <Badge tone="positive">Activo</Badge>
                    ) : (
                      <Badge tone="neutral">Pausado</Badge>
                    )}
                  </Td>
                  {canCreate && (
                    <Td align="right">
                      <RecurringManager
                        categories={categories}
                        accounts={accounts}
                        currency={currency}
                        item={item}
                      />
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>
    </>
  );
}
