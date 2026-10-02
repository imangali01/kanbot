import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/env';
import * as schema from './schema';

function create() {
  const sql = postgres(env.databaseUrl, { prepare: false, max: 5 });
  return drizzle(sql, { schema });
}

export type Db = ReturnType<typeof create>;

const g = globalThis as unknown as { __kanbotDb?: Db };

export function getDb(): Db {
  g.__kanbotDb ??= create();
  return g.__kanbotDb;
}
