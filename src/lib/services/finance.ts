import 'server-only';

/**
 * Servicio financiero: libro mayor, cuentas, cuentas por cobrar/pagar y pagos.
 *
 * El ledger (`financialTransactions`) es la ÚNICA fuente de verdad del dinero.
 * Cada asiento se escribe junto con la actualización del saldo de la cuenta,
 * dentro de la misma transacción, y guarda el `balanceAfter` resultante para
 * poder auditar el saldo en cualquier momento del tiempo.
 */
import type { Transaction } from 'firebase-admin/firestore';

import { COLLECTIONS } from '@/lib/firebase/collections';
import { errors } from '@/lib/errors';
import { newDoc, refs } from '@/lib/repositories/refs';
import { nowIso } from '@/lib/repositories/base';
import { deriveReceivableStatus } from '@/lib/state-machines';
import type { ActorContext, Id, IsoDate, Money } from '@/types/common';
import type {
  AccountPayable,
  AccountReceivable,
  FinancialAccount,
  FinancialTransaction,
  FinancialTransactionType,
  Payment,
  PaymentMethod,
  PaymentType,
  TransactionDirection,
} from '@/types/finance';

export interface LedgerEntryInput {
  actor: ActorContext;
  actorName: string;
  account: FinancialAccount;
  /** Saldo vigente de la cuenta al momento del asiento (permite encadenar). */
  currentBalance: Money;
  amount: Money;
  direction: TransactionDirection;
  type: FinancialTransactionType;
  referenceType: string;
  referenceId: Id | null;
  referenceNumber: string | null;
  date: IsoDate;
  description: string;
  transferId?: Id | null;
}

export interface LedgerEntryResult {
  transactionId: Id;
  balanceAfter: Money;
}

/**
 * Registra un asiento en el libro mayor y actualiza el saldo de la cuenta.
 * Devuelve el nuevo saldo para poder encadenar varios asientos sobre la misma
 * cuenta dentro de una sola transacción.
 */
export function postLedgerEntry(tx: Transaction, input: LedgerEntryInput): LedgerEntryResult {
  if (input.amount <= 0) {
    throw errors.validation('El importe del movimiento debe ser mayor que cero.');
  }
  if (input.account.status !== 'ACTIVE') {
    throw errors.validation(`La cuenta "${input.account.name}" está inactiva.`);
  }

  const delta = input.direction === 'IN' ? input.amount : -input.amount;
  const balanceAfter = input.currentBalance + delta;

  const ref = newDoc(COLLECTIONS.FINANCIAL_TRANSACTIONS);
  const entry: FinancialTransaction = {
    id: ref.id,
    organizationId: input.actor.organizationId,
    type: input.type,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    referenceNumber: input.referenceNumber,
    accountId: input.account.id,
    accountName: input.account.name,
    amount: input.amount,
    direction: input.direction,
    balanceAfter,
    date: input.date,
    description: input.description,
    transferId: input.transferId ?? null,
    createdBy: input.actor.userId,
    createdByName: input.actorName,
    createdAt: nowIso(),
  };

  tx.create(ref, entry);
  tx.set(
    refs.financialAccount(input.account.id),
    { currentBalance: balanceAfter, updatedAt: nowIso(), updatedBy: input.actor.userId },
    { merge: true },
  );

  return { transactionId: ref.id, balanceAfter };
}

export interface PaymentRecordInput {
  actor: ActorContext;
  number: string;
  type: PaymentType;
  referenceType: string;
  referenceId: Id;
  referenceNumber: string;
  partyId: Id | null;
  partyName: string;
  account: FinancialAccount;
  amount: Money;
  date: IsoDate;
  method: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
}

/** Crea el documento `Payment` que respalda un cobro o pago. */
export function writePayment(tx: Transaction, input: PaymentRecordInput): Payment {
  const ref = newDoc(COLLECTIONS.PAYMENTS);
  const payment: Payment = {
    id: ref.id,
    organizationId: input.actor.organizationId,
    number: input.number,
    type: input.type,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    referenceNumber: input.referenceNumber,
    partyId: input.partyId,
    partyName: input.partyName,
    accountId: input.account.id,
    accountName: input.account.name,
    amount: input.amount,
    date: input.date,
    method: input.method,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    cancelledAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: input.actor.userId,
    updatedBy: input.actor.userId,
  };
  tx.create(ref, payment);
  return payment;
}

export interface ReceivableInput {
  actor: ActorContext;
  customerId: Id;
  customerName: string;
  saleId: Id;
  saleNumber: string;
  amount: Money;
  paidAmount: Money;
  issueDate: IsoDate;
  dueDate: IsoDate;
}

/** Crea la cuenta por cobrar de una venta a crédito. */
export function writeReceivable(tx: Transaction, input: ReceivableInput): AccountReceivable {
  const ref = newDoc(COLLECTIONS.ACCOUNTS_RECEIVABLE);
  const remaining = input.amount - input.paidAmount;
  const receivable: AccountReceivable = {
    id: ref.id,
    organizationId: input.actor.organizationId,
    customerId: input.customerId,
    customerName: input.customerName,
    referenceType: 'SALE',
    referenceId: input.saleId,
    referenceNumber: input.saleNumber,
    originalAmount: input.amount,
    paidAmount: input.paidAmount,
    remainingAmount: remaining,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    status: deriveReceivableStatus(input.amount, input.paidAmount, input.dueDate),
    notes: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: input.actor.userId,
    updatedBy: input.actor.userId,
  };
  tx.create(ref, receivable);
  return receivable;
}

export interface PayableInput {
  actor: ActorContext;
  supplierId: Id;
  supplierName: string;
  referenceType: 'PURCHASE' | 'EXPENSE';
  referenceId: Id;
  referenceNumber: string;
  amount: Money;
  paidAmount: Money;
  issueDate: IsoDate;
  dueDate: IsoDate;
}

/** Crea la cuenta por pagar de una compra o gasto a crédito. */
export function writePayable(tx: Transaction, input: PayableInput): AccountPayable {
  const ref = newDoc(COLLECTIONS.ACCOUNTS_PAYABLE);
  const remaining = input.amount - input.paidAmount;
  const payable: AccountPayable = {
    id: ref.id,
    organizationId: input.actor.organizationId,
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    referenceNumber: input.referenceNumber,
    originalAmount: input.amount,
    paidAmount: input.paidAmount,
    remainingAmount: remaining,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    status: deriveReceivableStatus(input.amount, input.paidAmount, input.dueDate),
    notes: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: input.actor.userId,
    updatedBy: input.actor.userId,
  };
  tx.create(ref, payable);
  return payable;
}

/** Aplica un abono sobre una cuenta por cobrar ya leída. */
export function applyToReceivable(
  tx: Transaction,
  actor: ActorContext,
  receivable: AccountReceivable,
  amount: Money,
): { paidAmount: Money; remainingAmount: Money; status: AccountReceivable['status'] } {
  const paidAmount = receivable.paidAmount + amount;
  if (paidAmount > receivable.originalAmount) {
    throw errors.validation('El abono excede el saldo pendiente de la cuenta por cobrar.');
  }
  const remainingAmount = receivable.originalAmount - paidAmount;
  const status = deriveReceivableStatus(receivable.originalAmount, paidAmount, receivable.dueDate);

  tx.set(
    refs.receivable(receivable.id),
    { paidAmount, remainingAmount, status, updatedAt: nowIso(), updatedBy: actor.userId },
    { merge: true },
  );

  return { paidAmount, remainingAmount, status };
}

/** Aplica un abono sobre una cuenta por pagar ya leída. */
export function applyToPayable(
  tx: Transaction,
  actor: ActorContext,
  payable: AccountPayable,
  amount: Money,
): { paidAmount: Money; remainingAmount: Money; status: AccountPayable['status'] } {
  const paidAmount = payable.paidAmount + amount;
  if (paidAmount > payable.originalAmount) {
    throw errors.validation('El pago excede el saldo pendiente de la cuenta por pagar.');
  }
  const remainingAmount = payable.originalAmount - paidAmount;
  const status = deriveReceivableStatus(payable.originalAmount, paidAmount, payable.dueDate);

  tx.set(
    refs.payable(payable.id),
    { paidAmount, remainingAmount, status, updatedAt: nowIso(), updatedBy: actor.userId },
    { merge: true },
  );

  return { paidAmount, remainingAmount, status };
}

/** Ajusta las métricas denormalizadas de un cliente o proveedor. */
export function bumpPartyStats(
  tx: Transaction,
  actor: ActorContext,
  party: 'customer' | 'supplier',
  partyId: Id,
  current: { totalAmount: Money; documentCount: number; outstandingBalance: Money },
  delta: { totalAmount?: Money; documentCount?: number; outstandingBalance?: Money; lastDocumentAt?: IsoDate },
): void {
  const ref = party === 'customer' ? refs.customer(partyId) : refs.supplier(partyId);
  tx.set(
    ref,
    {
      stats: {
        totalAmount: current.totalAmount + (delta.totalAmount ?? 0),
        documentCount: current.documentCount + (delta.documentCount ?? 0),
        outstandingBalance: current.outstandingBalance + (delta.outstandingBalance ?? 0),
        ...(delta.lastDocumentAt ? { lastDocumentAt: delta.lastDocumentAt } : {}),
      },
      updatedAt: nowIso(),
      updatedBy: actor.userId,
    },
    { merge: true },
  );
}
