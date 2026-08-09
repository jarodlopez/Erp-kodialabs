/**
 * Firestore en memoria.
 *
 * Implementa el subconjunto del Admin SDK que usa el ERP (documentos,
 * consultas con filtros y orden, transacciones, lotes e `increment`) para
 * poder ejecutar pruebas de integración REALES de los servicios de negocio
 * —ventas, compras, inventario, finanzas— sin depender de un emulador ni de
 * la red.
 *
 * No pretende ser un clon completo de Firestore: cubre exactamente lo que el
 * sistema utiliza, y falla de forma ruidosa ante operaciones no soportadas.
 */

export class FakeFieldValue {
  constructor(
    readonly kind: 'increment' | 'serverTimestamp',
    readonly operand: number = 0,
  ) {}

  static increment(value: number): FakeFieldValue {
    return new FakeFieldValue('increment', value);
  }

  static serverTimestamp(): FakeFieldValue {
    return new FakeFieldValue('serverTimestamp');
  }

  isEqual(other: unknown): boolean {
    return other === this;
  }
}

export class FakeTimestamp {
  constructor(readonly seconds: number, readonly nanoseconds: number) {}

  static fromDate(date: Date): FakeTimestamp {
    return new FakeTimestamp(Math.floor(date.getTime() / 1000), 0);
  }

  static now(): FakeTimestamp {
    return FakeTimestamp.fromDate(new Date());
  }

  toDate(): Date {
    return new Date(this.seconds * 1000);
  }
}

type Doc = Record<string, unknown>;

let idCounter = 0;
function generateId(): string {
  idCounter += 1;
  return `id${String(idCounter).padStart(8, '0')}`;
}

function getPath(data: Doc, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, data);
}

function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepClone) as unknown as T;
  if (value instanceof FakeTimestamp) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = deepClone(item);
  }
  return out as T;
}

/** Fusiona `patch` sobre `base` resolviendo los centinelas `FieldValue`. */
function applyMerge(base: Doc, patch: Doc): Doc {
  const result: Doc = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value instanceof FakeFieldValue) {
      if (value.kind === 'increment') {
        result[key] = Number(result[key] ?? 0) + value.operand;
      } else {
        result[key] = new Date().toISOString();
      }
    } else if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof FakeTimestamp) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = applyMerge(result[key] as Doc, value as Doc);
    } else if (value !== undefined) {
      result[key] = deepClone(value);
    }
  }
  return result;
}

function resolveSentinels(data: Doc): Doc {
  const out: Doc = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof FakeFieldValue) {
      out[key] = value.kind === 'increment' ? value.operand : new Date().toISOString();
    } else if (value !== undefined) {
      out[key] = deepClone(value);
    }
  }
  return out;
}

interface WhereClause {
  field: string;
  op: string;
  value: unknown;
}

interface OrderClause {
  field: string;
  direction: 'asc' | 'desc';
}

export class FakeDocumentSnapshot {
  constructor(
    readonly id: string,
    private readonly value: Doc | undefined,
    readonly ref: FakeDocumentReference,
  ) {}

  get exists(): boolean {
    return this.value !== undefined;
  }

  data(): Doc | undefined {
    return this.value ? deepClone(this.value) : undefined;
  }
}

export class FakeDocumentReference {
  constructor(
    readonly store: FakeFirestore,
    readonly collectionName: string,
    readonly id: string,
  ) {}

  get path(): string {
    return `${this.collectionName}/${this.id}`;
  }

  async get(): Promise<FakeDocumentSnapshot> {
    return new FakeDocumentSnapshot(this.id, this.store.read(this.collectionName, this.id), this);
  }

  async set(data: Doc, options?: { merge?: boolean }): Promise<void> {
    this.store.write(this.collectionName, this.id, data, options?.merge ?? false);
  }

  async create(data: Doc): Promise<void> {
    if (this.store.read(this.collectionName, this.id)) {
      throw new Error(`ALREADY_EXISTS: ${this.path}`);
    }
    this.store.write(this.collectionName, this.id, data, false);
  }

  async update(data: Doc): Promise<void> {
    if (!this.store.read(this.collectionName, this.id)) {
      throw new Error(`NOT_FOUND: ${this.path}`);
    }
    this.store.write(this.collectionName, this.id, data, true);
  }

  async delete(): Promise<void> {
    this.store.remove(this.collectionName, this.id);
  }
}

export class FakeQuery {
  constructor(
    protected readonly store: FakeFirestore,
    protected readonly collectionName: string,
    protected readonly wheres: WhereClause[] = [],
    protected readonly orders: OrderClause[] = [],
    protected readonly limitValue: number | null = null,
    protected readonly cursor: unknown[] | null = null,
  ) {}

  where(field: string, op: string, value: unknown): FakeQuery {
    return new FakeQuery(
      this.store,
      this.collectionName,
      [...this.wheres, { field, op, value }],
      this.orders,
      this.limitValue,
      this.cursor,
    );
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): FakeQuery {
    return new FakeQuery(
      this.store,
      this.collectionName,
      this.wheres,
      [...this.orders, { field, direction }],
      this.limitValue,
      this.cursor,
    );
  }

  limit(value: number): FakeQuery {
    return new FakeQuery(
      this.store,
      this.collectionName,
      this.wheres,
      this.orders,
      value,
      this.cursor,
    );
  }

  startAfter(...values: unknown[]): FakeQuery {
    return new FakeQuery(
      this.store,
      this.collectionName,
      this.wheres,
      this.orders,
      this.limitValue,
      values,
    );
  }

  count() {
    return {
      get: async () => ({ data: () => ({ count: this.resolve().length }) }),
    };
  }

  async get(): Promise<{ docs: FakeDocumentSnapshot[]; empty: boolean; size: number }> {
    const docs = this.resolve().map(
      ([id, data]) =>
        new FakeDocumentSnapshot(
          id,
          data,
          new FakeDocumentReference(this.store, this.collectionName, id),
        ),
    );
    return { docs, empty: docs.length === 0, size: docs.length };
  }

  protected resolve(): [string, Doc][] {
    const collection = this.store.collectionData(this.collectionName);
    let entries: [string, Doc][] = [...collection.entries()];

    for (const clause of this.wheres) {
      entries = entries.filter(([id, data]) => {
        const actual = clause.field === '__name__' ? id : getPath(data, clause.field);
        return matches(actual, clause.op, clause.value);
      });
    }

    if (this.orders.length > 0) {
      entries.sort((a, b) => {
        for (const order of this.orders) {
          const left = order.field === '__name__' ? a[0] : getPath(a[1], order.field);
          const right = order.field === '__name__' ? b[0] : getPath(b[1], order.field);
          const result = compare(left, right);
          if (result !== 0) return order.direction === 'desc' ? -result : result;
        }
        return 0;
      });
    }

    if (this.cursor && this.orders.length > 0) {
      const index = entries.findIndex(([id, data]) =>
        this.orders.every((order, position) => {
          const actual = order.field === '__name__' ? id : getPath(data, order.field);
          return compare(actual, this.cursor?.[position]) === 0;
        }),
      );
      if (index >= 0) entries = entries.slice(index + 1);
    }

    if (this.limitValue !== null) entries = entries.slice(0, this.limitValue);
    return entries;
  }
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

function matches(actual: unknown, op: string, expected: unknown): boolean {
  switch (op) {
    case '==':
      return actual === expected;
    case '!=':
      return actual !== expected;
    case '>':
      return compare(actual, expected) > 0;
    case '>=':
      return compare(actual, expected) >= 0;
    case '<':
      return compare(actual, expected) < 0;
    case '<=':
      return compare(actual, expected) <= 0;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    case 'array-contains':
      return Array.isArray(actual) && actual.includes(expected);
    default:
      throw new Error(`Operador no soportado en el Firestore de pruebas: ${op}`);
  }
}

export class FakeCollectionReference extends FakeQuery {
  doc(id?: string): FakeDocumentReference {
    return new FakeDocumentReference(this.store, this.collectionName, id ?? generateId());
  }
}

interface PendingWrite {
  collectionName: string;
  id: string;
  data: Doc;
  merge: boolean;
  mode: 'set' | 'create' | 'update' | 'delete';
}

export class FakeTransaction {
  private readonly writes: PendingWrite[] = [];

  constructor(private readonly store: FakeFirestore) {}

  async get(target: FakeDocumentReference | FakeQuery): Promise<never | FakeDocumentSnapshot | { docs: FakeDocumentSnapshot[]; empty: boolean; size: number }> {
    if (target instanceof FakeDocumentReference) {
      return target.get();
    }
    return target.get();
  }

  set(ref: FakeDocumentReference, data: Doc, options?: { merge?: boolean }): void {
    this.writes.push({
      collectionName: ref.collectionName,
      id: ref.id,
      data,
      merge: options?.merge ?? false,
      mode: 'set',
    });
  }

  create(ref: FakeDocumentReference, data: Doc): void {
    this.writes.push({
      collectionName: ref.collectionName,
      id: ref.id,
      data,
      merge: false,
      mode: 'create',
    });
  }

  update(ref: FakeDocumentReference, data: Doc): void {
    this.writes.push({
      collectionName: ref.collectionName,
      id: ref.id,
      data,
      merge: true,
      mode: 'update',
    });
  }

  delete(ref: FakeDocumentReference): void {
    this.writes.push({
      collectionName: ref.collectionName,
      id: ref.id,
      data: {},
      merge: false,
      mode: 'delete',
    });
  }

  commit(): void {
    for (const write of this.writes) {
      if (write.mode === 'delete') {
        this.store.remove(write.collectionName, write.id);
        continue;
      }
      if (write.mode === 'create' && this.store.read(write.collectionName, write.id)) {
        throw new Error(`ALREADY_EXISTS: ${write.collectionName}/${write.id}`);
      }
      this.store.write(write.collectionName, write.id, write.data, write.merge);
    }
  }
}

export class FakeWriteBatch {
  private readonly writes: PendingWrite[] = [];

  constructor(private readonly store: FakeFirestore) {}

  set(ref: FakeDocumentReference, data: Doc, options?: { merge?: boolean }): FakeWriteBatch {
    this.writes.push({
      collectionName: ref.collectionName,
      id: ref.id,
      data,
      merge: options?.merge ?? false,
      mode: 'set',
    });
    return this;
  }

  create(ref: FakeDocumentReference, data: Doc): FakeWriteBatch {
    this.writes.push({
      collectionName: ref.collectionName,
      id: ref.id,
      data,
      merge: false,
      mode: 'create',
    });
    return this;
  }

  update(ref: FakeDocumentReference, data: Doc): FakeWriteBatch {
    this.writes.push({
      collectionName: ref.collectionName,
      id: ref.id,
      data,
      merge: true,
      mode: 'update',
    });
    return this;
  }

  async commit(): Promise<void> {
    for (const write of this.writes) {
      this.store.write(write.collectionName, write.id, write.data, write.merge);
    }
  }
}

export class FakeFirestore {
  private readonly data = new Map<string, Map<string, Doc>>();

  collection(name: string): FakeCollectionReference {
    return new FakeCollectionReference(this, name);
  }

  batch(): FakeWriteBatch {
    return new FakeWriteBatch(this);
  }

  settings(): void {
    // Compatibilidad con `db.settings({ ignoreUndefinedProperties: true })`.
  }

  async runTransaction<T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    const tx = new FakeTransaction(this);
    const result = await fn(tx);
    tx.commit();
    return result;
  }

  collectionData(name: string): Map<string, Doc> {
    let collection = this.data.get(name);
    if (!collection) {
      collection = new Map<string, Doc>();
      this.data.set(name, collection);
    }
    return collection;
  }

  read(collectionName: string, id: string): Doc | undefined {
    return this.collectionData(collectionName).get(id);
  }

  write(collectionName: string, id: string, data: Doc, merge: boolean): void {
    const collection = this.collectionData(collectionName);
    const current = collection.get(id);
    collection.set(id, merge && current ? applyMerge(current, data) : resolveSentinels(data));
  }

  remove(collectionName: string, id: string): void {
    this.collectionData(collectionName).delete(id);
  }

  /** Utilidad para las aserciones de las pruebas. */
  all<T = Doc>(collectionName: string): T[] {
    return [...this.collectionData(collectionName).values()].map((doc) => deepClone(doc) as T);
  }

  reset(): void {
    this.data.clear();
  }
}

export const fakeDb = new FakeFirestore();
