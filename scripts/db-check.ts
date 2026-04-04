#!/usr/bin/env tsx
/**
 * Checks database connectivity and schema status.
 * Usage: pnpm db:check
 */

import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  console.log('Checking database connection...');
  const sql = postgres(url, { prepare: false, connect_timeout: 10 });

  try {
    const result = await sql`SELECT 1 as ok`;
    if (result[0]?.ok === 1) {
      console.log('Database connection successful');
    }

    // Check schemas
    const schemas = await sql`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name IN ('public', 'workshop')
      ORDER BY schema_name
    `;
    console.log(`Schemas: ${schemas.map(s => s.schema_name).join(', ') || 'none found'}`);

    if (!schemas.some(s => s.schema_name === 'workshop')) {
      console.warn('Schema "workshop" not found. Run: pnpm db:init');
    }

    // Check tables in both schemas
    const tables = await sql`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema IN ('public', 'workshop')
      ORDER BY table_schema, table_name
    `;

    if (tables.length === 0) {
      console.warn('No tables found. Run: pnpm db:push');
    } else {
      const grouped = tables.reduce((acc, t) => {
        (acc[t.table_schema] ??= []).push(t.table_name);
        return acc;
      }, {} as Record<string, string[]>);

      for (const [schema, names] of Object.entries(grouped)) {
        console.log(`  ${schema}: ${names.join(', ')}`);
      }
    }
  } catch (err) {
    console.error('Database connection failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
