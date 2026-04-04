/**
 * Schema barrel export.
 *
 * - shared.ts: public schema tables (users, integrationConnections)
 *   shared across all sibling apps
 * - workshop.ts: workshop-namespaced tables (pgSchema('workshop'))
 *   isolated to this application
 */

export { users, engagements, integrationConnections } from './shared';
export {
  workshopSchema,
  workflows,
  runs,
} from './workshop';
