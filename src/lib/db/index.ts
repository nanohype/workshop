import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

function createDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    // Use console.warn here since logger may not be initialized during module load
    console.warn('[workshop] DATABASE_URL not set — database operations will fail');
    // Return a proxy that throws helpful errors
    return null;
  }
  const client = postgres(connectionString, {
    prepare: false,
    max: parseInt(process.env.DB_POOL_SIZE || '10', 10),
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30, // 30 minutes
  });
  return drizzle(client, { schema });
}

const _db = createDb();

export function getDb() {
  if (!_db) {
    throw new Error('Database not configured. Set DATABASE_URL environment variable.');
  }
  return _db;
}

// For backwards compatibility — will throw if DB not configured
export const db = new Proxy({} as NonNullable<typeof _db>, {
  get(_, prop) {
    const instance = getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (instance as Record<string, any>)[prop as string];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});

export type Database = NonNullable<typeof _db>;
