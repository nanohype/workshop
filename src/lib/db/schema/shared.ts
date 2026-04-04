/**
 * Shared schema — public tables used across all sibling apps.
 * These live in the default `public` schema so all apps can reference them.
 *
 * IMPORTANT: definitions here must stay in sync across all three apps.
 * Any app's push/migrate will affect these tables for all apps.
 */

import { pgTable, text, timestamp, jsonb, boolean, uuid, index } from 'drizzle-orm/pg-core';

// ── public.users ──────────────────────────────────────────────────────────────
// Shared identity table. Same definition in all sibling apps.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  image: text('image'),
  githubId: text('github_id').unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── public.engagements ────────────────────────────────────────────────────────
// The core shared entity. Ulterior creates these when a lead becomes a contract.
// Other apps can reference these for cross-app features.
export const engagements = pgTable('engagements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  clientName: text('client_name'),
  description: text('description'),
  status: text('status').notNull().default('active'),
  startDate: timestamp('start_date'),
  targetEndDate: timestamp('target_end_date'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_engagements_user').on(table.userId),
  index('idx_engagements_status').on(table.status),
  index('idx_engagements_slug').on(table.slug),
]);

// ── public.integration_connections ────────────────────────────────────────────
// Shared OAuth tokens. Connect once, use from any app.
// All apps must use the same ENCRYPTION_SECRET.
export const integrationConnections = pgTable('integration_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  integrationId: text('integration_id').notNull(),
  encryptedAccessToken: text('encrypted_access_token').notNull(),
  encryptedRefreshToken: text('encrypted_refresh_token'),
  iv: text('iv').notNull(),
  authTag: text('auth_tag').notNull(),
  tokenExpiresAt: timestamp('token_expires_at'),
  metadata: jsonb('metadata').default({}),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_ic_user').on(table.userId),
  index('idx_ic_user_integration').on(table.userId, table.integrationId),
]);
