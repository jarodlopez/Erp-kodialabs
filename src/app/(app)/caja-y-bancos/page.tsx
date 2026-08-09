import type { Metadata } from 'next';
import { Wallet } from 'lucide-react';

import { KpiCard, Money } from '@/components/domain/indicators';
import { DonutChart } from '@/components/ui/charts';
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
import { accountRepository, ledgerRepository, transferRepository } from '@/lib/repositories/finance';
import { organizationRepository } from '@/lib/repositories/organization';
import { formatDate, formatDateTime, startOfMonthInput, toDateInput } from '@/lib/utils';
import { ACCOUNT_TYPE_LABELS, TRANSACTION_TYPE_LABELS } from '@/types/finance';
import { TreasuryActions } from './treasury-actions';

export const metadata: Metadata = { title: 'Caja y bancos' };
export const dynamic = 'force-dynamic';

export default async function TreasuryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.FINANCE_VIEW);
  const params = await searchParams;

  const from = params.from ?? startOfMonthInput();
  const to = params.to ?? toDateInput();

  const [settings, accounts, movements, transfers] = await Promise.all([
    organizationRepository.getSettings(session.organizationId),
    accountRepository.list(session.organizationId, true),
    ledgerRepository.list(
      session.organizationId,
      { from, to },
      { limit: 15 },
    ),
    transferRepository.list(session.organizationId, { limit: 10 }),
  ]);

  const currency = settings.currency;
  const cash = accounts.filter((a) => a.type === 'CASH').reduce((acc, a) => acc + a.currentBalance, 0);
  const bank = accounts.filter((a) => a.type !== 'CASH').reduce((acc, a) => acc + a.currentBalance, 0);

  return (
    <>
      <PageHeader
        title="Caja y bancos"
        description="Saldos actuales, movimientos recientes y transferencias internas."
        actions={
          <TreasuryActions
            accounts={accounts.filter((a) => a.status === 'ACTIVE')}
            currency={currency}
            canCreate={session.permissions.includes(PERMISSIONS.FINANCE_CREATE)}
            canTransfer={session.permissions.includes(PERMISSIONS.FINANCE_TRANSFER)}
            canAdjust={session.permissions.includes(PERMISSIONS.FINANCE_ADJUST)}
          />
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Efectivo en caja" value={<Money value={cash} currency={currency} />} />
        <KpiCard label="Bancos y otros" value={<Money value={bank} currency={currency} />} />
        <KpiCard
          label="Disponible total"
          value={<Money value={cash + bank} currency={currency} />}
          tone="brand"
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Cuentas" description="Saldo vigente de cada cuenta." />
          {accounts.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-5 w-5" />}
              title="Sin cuentas financieras"
              description="Crea al menos una caja para poder cobrar ventas y pagar gastos."
            />
          ) : (
            <TableWrapper>
              <thead>
                <tr>
                  <Th>Cuenta</Th>
                  <Th>Tipo</Th>
                  <Th>Detalle</Th>
                  <Th align="right">Saldo inicial</Th>
                  <Th align="right">Saldo actual</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <Tr key={account.id}>
                    <Td>
                      <span className="font-medium">{account.name}</span>
                      {account.isDefault && (
                        <Badge tone="brand" className="ml-2">
                          Predeterminada
                        </Badge>
                      )}
                    </Td>
                    <Td>{ACCOUNT_TYPE_LABELS[account.type]}</Td>
                    <Td className="text-[var(--color-ink-subtle)]">
                      {account.bankName ?? '—'}
                      {account.accountNumber ? ` · ${account.accountNumber}` : ''}
                    </Td>
                    <Td align="right">
                      <Money value={account.initialBalance} currency={currency} />
                    </Td>
                    <Td align="right">
                      <span className="font-semibold">
                        <Money value={account.currentBalance} currency={currency} />
                      </span>
                    </Td>
                    <Td>
                      {account.status === 'ACTIVE' ? (
                        <Badge tone="positive">Activa</Badge>
                      ) : (
                        <Badge tone="neutral">Inactiva</Badge>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrapper>
          )}
        </Card>

        <Card>
          <CardHeader title="Distribución del efectivo" />
          <div className="p-5">
            <DonutChart
              currency={currency}
              segments={accounts
                .filter((a) => a.currentBalance > 0)
                .map((a) => ({ label: a.name, value: a.currentBalance }))}
            />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Movimientos recientes"
            description={`Del ${formatDate(from)} al ${formatDate(to)}`}
          />
          {movements.items.length === 0 ? (
            <EmptyState title="Sin movimientos" description="No hay asientos en este periodo." />
          ) : (
            <TableWrapper className="min-w-0">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Concepto</Th>
                  <Th align="right">Importe</Th>
                </tr>
              </thead>
              <tbody>
                {movements.items.map((movement) => (
                  <Tr key={movement.id}>
                    <Td>
                      <span className="text-xs">{formatDate(movement.date)}</span>
                      <p className="text-xs text-[var(--color-ink-subtle)]">{movement.accountName}</p>
                    </Td>
                    <Td className="max-w-[220px]">
                      <p className="truncate">{movement.description}</p>
                      <p className="text-xs text-[var(--color-ink-subtle)]">
                        {TRANSACTION_TYPE_LABELS[movement.type]}
                      </p>
                    </Td>
                    <Td align="right">
                      <span
                        className={
                          movement.direction === 'IN'
                            ? 'font-medium text-[var(--color-positive-700)]'
                            : 'font-medium text-[var(--color-danger-700)]'
                        }
                      >
                        {movement.direction === 'IN' ? '+' : '−'}
                        <Money value={movement.amount} currency={currency} />
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrapper>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Transferencias internas"
            description="No se contabilizan como ingreso ni como gasto."
          />
          {transfers.items.length === 0 ? (
            <EmptyState
              title="Sin transferencias"
              description="Aquí verás los movimientos entre tus propias cuentas."
            />
          ) : (
            <TableWrapper className="min-w-0">
              <thead>
                <tr>
                  <Th>Número</Th>
                  <Th>Origen → destino</Th>
                  <Th align="right">Importe</Th>
                </tr>
              </thead>
              <tbody>
                {transfers.items.map((transfer) => (
                  <Tr key={transfer.id}>
                    <Td>
                      <span className="font-medium">{transfer.number}</span>
                      <p className="text-xs text-[var(--color-ink-subtle)]">
                        {formatDateTime(transfer.date)}
                      </p>
                    </Td>
                    <Td className="text-[var(--color-ink-muted)]">
                      {transfer.sourceAccountName} → {transfer.destinationAccountName}
                    </Td>
                    <Td align="right">
                      <Money value={transfer.amount} currency={currency} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrapper>
          )}
        </Card>
      </div>
    </>
  );
}
