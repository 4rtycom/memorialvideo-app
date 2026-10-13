import { getSqlQueryOverride, PersistenceUnavailableError } from './persistence';

type SqlRows = Record<string, unknown>[];

const SCHEMA_STATEMENTS = [
  `create table if not exists creator_store (
    id text primary key,
    document text not null,
    updated_at timestamptz not null default now()
  )`,
  `alter table creator_store enable row level security`,
  `alter table creator_store force row level security`,
  `do $$
   begin
     if not exists (select 1 from pg_roles where rolname = 'creator_app') then
       create role creator_app;
     end if;
   end $$`,
  `grant select, insert, update, delete on table creator_store to creator_app`,
  `drop policy if exists creator_app_all on creator_store`,
  `create policy creator_app_all on creator_store
     for all
     to creator_app
     using (true)
     with check (true)`,
] as const;

let postgresClient: { unsafe: (sql: string, params: unknown[]) => Promise<SqlRows> } | null = null;
let schemaReady: Promise<void> | null = null;

async function query(sql: string, params: unknown[]): Promise<SqlRows> {
  const override = getSqlQueryOverride();
  if (override) {
    return override(sql, params);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new PersistenceUnavailableError('DATABASE_URL is not configured.', {
      kind: 'database',
      xb012: true,
    });
  }
  if (!postgresClient) {
    const { default: postgres } = await import('postgres');
    const sqlClient = postgres(databaseUrl, { max: 1, idle_timeout: 20 });
    postgresClient = {
      unsafe: async (text, values) => sqlClient.unsafe(text, values as never[]) as unknown as SqlRows,
    };
  }
  try {
    return await postgresClient.unsafe(sql, params);
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      throw error;
    }
    throw new PersistenceUnavailableError('PostgreSQL tribute store is unavailable.', {
      kind: 'database',
      xb012: false,
    });
  }
}

export async function ensureCreatorStoreSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const statement of SCHEMA_STATEMENTS) {
        await query(statement, []);
      }
    })().catch((error: unknown) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

export async function readSqlDocument(): Promise<string | null> {
  await ensureCreatorStoreSchema();
  const rows = await query(`select document from creator_store where id = $1`, ['v5']);
  const document = rows[0]?.document;
  return typeof document === 'string' ? document : null;
}

export async function writeSqlDocument(document: string): Promise<void> {
  await ensureCreatorStoreSchema();
  await query(
    `insert into creator_store (id, document, updated_at)
     values ($1, $2, now())
     on conflict (id) do update
       set document = excluded.document,
           updated_at = now()`,
    ['v5', document],
  );
}

/** Test helper: reset the schema promise between isolated databases. */
export function resetSqlSchemaForTests(): void {
  schemaReady = null;
  postgresClient = null;
}
