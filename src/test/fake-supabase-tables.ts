/**
 * An in-memory stand-in for the Supabase query builder, for route unit tests
 * that need to see rows change across several queries (insert, then update,
 * then read back).
 *
 * It implements only what those routes call: `from(table)` with `select`
 * (a plain column list, no embedded resources), `insert`, `update`, `eq`,
 * `neq`, and the terminals `single`, `maybeSingle` and a plain `await`. It
 * applies the query's own filters and NOTHING else: no RLS. That is
 * deliberate, so a test proves the code filters on `user_id` itself rather
 * than leaning on a policy.
 *
 * A failure can be injected per table and operation, optionally only for the
 * n-th such query or for queries a predicate picks; the failing query then
 * changes nothing, as a refused statement would.
 */

export type Row = Record<string, unknown>

export interface FakeError {
  code: string
  message: string
}

export type Operation = 'select' | 'insert' | 'update'

/** `[column, value, operator]`; the operator is `eq` or `neq`. */
export type Filter = [string, unknown, 'eq' | 'neq']

export interface LoggedQuery {
  table: string
  operation: Operation
  filters: Filter[]
  payload?: Row
}

export interface FailureOptions {
  /** Fail only the n-th query (1-based) of this table and operation. */
  nth?: number
  /** Fail only the queries this predicate picks. */
  when?: (query: LoggedQuery) => boolean
}

interface QueryResult {
  data: unknown
  error: FakeError | null
}

interface Failure extends FailureOptions {
  table: string
  operation: Operation
}

export class FakeTables {
  readonly rows: Record<string, Row[]> = {}
  /** Every query run, in order, for assertions on what was (not) attempted. */
  readonly log: LoggedQuery[] = []
  private failures: Failure[] = []
  private nextId = 1

  seed(table: string, row: Row): Row {
    const stored = { ...row }
    ;(this.rows[table] ??= []).push(stored)
    return stored
  }

  table(table: string): Row[] {
    return this.rows[table] ?? []
  }

  find(table: string, id: unknown): Row | undefined {
    return this.table(table).find((row) => row.id === id)
  }

  failOn(table: string, operation: Operation, options: FailureOptions = {}): void {
    this.failures.push({ table, operation, ...options })
  }

  /** The queries that wrote: inserts and updates. */
  writes(): LoggedQuery[] {
    return this.log.filter((query) => query.operation !== 'select')
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table)
  }

  private shouldFail(query: LoggedQuery): boolean {
    const ordinal = this.log.filter((entry) => entry.table === query.table && entry.operation === query.operation).length
    return this.failures.some(
      (failure) =>
        failure.table === query.table &&
        failure.operation === query.operation &&
        (failure.nth === undefined || failure.nth === ordinal) &&
        (failure.when === undefined || failure.when(query))
    )
  }

  /** @internal */
  run(table: string, operation: Operation, filters: Filter[], payload: Row | undefined, returning: boolean): QueryResult {
    const query: LoggedQuery = { table, operation, filters, payload }
    this.log.push(query)
    if (this.shouldFail(query)) {
      return { data: null, error: { code: 'XX000', message: `injected ${operation} failure on ${table}` } }
    }
    const rows = (this.rows[table] ??= [])
    const matches = (row: Row) =>
      filters.every(([column, value, operator]) => (operator === 'eq' ? row[column] === value : row[column] !== value))

    if (operation === 'insert') {
      const stored = { id: `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`, ...payload }
      rows.push(stored)
      return { data: returning ? [{ ...stored }] : null, error: null }
    }
    if (operation === 'update') {
      const updated = rows.filter(matches)
      for (const row of updated) Object.assign(row, payload)
      return { data: returning ? updated.map((row) => ({ ...row })) : null, error: null }
    }
    return { data: rows.filter(matches).map((row) => ({ ...row })), error: null }
  }
}

class FakeQuery implements PromiseLike<QueryResult> {
  private operation: Operation = 'select'
  private payload: Row | undefined
  private returning = false
  private columns: string[] | null = null
  private readonly filters: Filter[] = []

  constructor(
    private readonly tables: FakeTables,
    private readonly tableName: string
  ) {}

  select(columns = '*'): this {
    this.columns = columns.trim() === '*' ? null : columns.split(',').map((column) => column.trim())
    if (this.operation !== 'select') this.returning = true
    return this
  }

  insert(payload: Row): this {
    this.operation = 'insert'
    this.payload = payload
    return this
  }

  update(payload: Row): this {
    this.operation = 'update'
    this.payload = payload
    return this
  }

  eq(column: string, value: unknown): this {
    this.filters.push([column, value, 'eq'])
    return this
  }

  neq(column: string, value: unknown): this {
    this.filters.push([column, value, 'neq'])
    return this
  }

  private execute(): QueryResult {
    const result = this.tables.run(this.tableName, this.operation, this.filters, this.payload, this.returning)
    const columns = this.columns
    if (!columns || !Array.isArray(result.data)) return result
    const projected = (result.data as Row[]).map((row) =>
      Object.fromEntries(columns.filter((column) => column in row).map((column) => [column, row[column]]))
    )
    return { ...result, data: projected }
  }

  async single(): Promise<QueryResult> {
    const result = this.execute()
    if (result.error) return result
    const rows = result.data as Row[]
    return rows.length === 1
      ? { data: rows[0], error: null }
      : { data: null, error: { code: 'PGRST116', message: `${rows.length} rows` } }
  }

  async maybeSingle(): Promise<QueryResult> {
    const result = this.execute()
    if (result.error) return result
    const rows = result.data as Row[]
    if (rows.length > 1) return { data: null, error: { code: 'PGRST116', message: `${rows.length} rows` } }
    return { data: rows[0] ?? null, error: null }
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected)
  }
}
