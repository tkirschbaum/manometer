import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { Env } from '../env';
import * as schema from './schema';

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

export interface Database {
  db: Db;
  /** 'postgres' (DATABASE_URL) or 'pglite' (embedded, local mode without Docker). */
  kind: 'postgres' | 'pglite';
  migrate: (migrationsFolder: string) => Promise<void>;
  ping: () => Promise<boolean>;
  close: () => Promise<void>;
}

export async function createDatabase(env: Pick<Env, 'DATABASE_URL' | 'PGLITE_DIR'>): Promise<Database> {
  if (env.DATABASE_URL) {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
    const db = drizzle({ client: pool, schema });
    return {
      db,
      kind: 'postgres',
      migrate: (migrationsFolder) => migrate(db, { migrationsFolder }),
      ping: () => ping(db),
      close: () => pool.end(),
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const dir = env.PGLITE_DIR === 'memory://' ? 'memory://' : resolve(env.PGLITE_DIR);
  if (dir !== 'memory://') mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle({ client, schema });
  return {
    db,
    kind: 'pglite',
    migrate: (migrationsFolder) => migrate(db, { migrationsFolder }),
    ping: () => ping(db),
    close: () => client.close(),
  };
}

async function ping(db: Db): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
