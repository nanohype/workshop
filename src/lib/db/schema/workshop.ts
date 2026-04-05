/**
 * Workshop schema — tables namespaced under the `workshop` PostgreSQL schema.
 * Keeps workshop-specific data isolated when sharing a database with
 * other apps sharing this database.
 */

import { pgSchema, text, timestamp, jsonb, uuid, index } from 'drizzle-orm/pg-core';
import { users } from './shared';

export const workshopSchema = pgSchema('workshop');

export const workflows = workshopSchema.table('workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').default(''),
  graphData: jsonb('graph_data').notNull().default({ nodes: [], edges: [] }),
  variables: jsonb('variables').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_workflows_user').on(table.userId),
  index('idx_workflows_updated_at').on(table.updatedAt),
]);

export const runs = workshopSchema.table('runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),
  context: jsonb('context').default({}),
  nodeStates: jsonb('node_states').default({}),
  tokenUsage: jsonb('token_usage').default({ input: 0, output: 0, cost: 0 }),
  checkpoint: jsonb('checkpoint'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
}, (table) => [
  index('idx_runs_user').on(table.userId),
  index('idx_runs_workflow').on(table.workflowId),
  index('idx_runs_status').on(table.status),
  index('idx_runs_started_at').on(table.startedAt),
  index('idx_runs_user_workflow').on(table.userId, table.workflowId),
]);
