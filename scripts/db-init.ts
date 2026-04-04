#!/usr/bin/env tsx
/**
 * Initialize the database — creates the `workshop` schema if it doesn't exist.
 * Run once before `pnpm db:push` or `pnpm db:migrate`.
 *
 * Usage: pnpm db:init
 */

import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const sql = postgres(url, { prepare: false, connect_timeout: 10 });

  try {
    await sql`CREATE SCHEMA IF NOT EXISTS workshop`;
    console.log('Schema "workshop" ready');

    // Verify
    const schemas = await sql`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name IN ('public', 'workshop')
      ORDER BY schema_name
    `;
    console.log(`Active schemas: ${schemas.map(s => s.schema_name).join(', ')}`);
  } catch (err) {
    console.error('Failed to initialize database:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
