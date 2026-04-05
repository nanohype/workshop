# Workshop

Visual workflow builder for nanohype templates. Part of the nanohype ecosystem.

## Tech Stack
- Next.js 16 (App Router) + TypeScript 5.x
- Tailwind CSS v4 + shadcn/ui + Radix primitives
- @xyflow/react v12 (React Flow) for graph editor
- Zustand 5 for state management
- Drizzle ORM 0.45 + PostgreSQL 16
- NextAuth v5 (password auth, JWT strategy)
- @nanohype/sdk for template rendering
- Claude Code CLI (spawned as subprocess)

## Key Architecture
- Graph execution engine: topological sort → BFS walk → parallel branches
- Node types: agent, condition, router, transform, gate, loop, input, output, scaffold, git-commit, github-pr, github-issue, github-checks, validate
- SSE streaming for live run monitoring with AbortController cleanup
- Dark-first UI with Electric indigo (#6366f1) primary
- Gate nodes for human-in-the-loop approval (polls DB, 1hr timeout)
- QuickJS WASM sandbox for condition/router/loop expression evaluation
- Scaffold node renders nanohype templates into workspace, outputs structured JSON
- Composite-to-workflow generator creates scaffold + review agent pairs

## Important Paths
- Engine: `src/lib/engine/` (graph.ts, executor.ts, scheduler.ts, context.ts, run-simple.ts, sandbox.ts, types.ts)
- nanohype: `src/lib/nanohype/` (catalog.ts, composite-to-workflow.ts)
- Provider: `src/lib/providers/claude-code.ts`
- DB: `src/lib/db/schema/` (shared.ts, workshop.ts)
- Auth: `src/lib/auth.ts`, `src/lib/api-auth.ts`, `src/proxy.ts`
- Config: `src/lib/config.ts`
- Stores: `src/lib/store/` (workflow-store, run-store, settings-store)
- Workflow Builder: `src/components/workflow/` (graph-canvas, node-types/, config-panel, toolbar, node-palette)
- nanohype UI: `src/components/nanohype/` (template-browser, variable-form, template-preview)
- API: `src/app/api/` (workflows, runs, nanohype/templates, nanohype/composites)

## Patterns
- Next.js 16 uses `params: Promise<>` for dynamic route params
- React Flow ↔ Zustand bidirectional sync uses refs (`isSyncingFromFlow`) to prevent loops
- ReactFlowProvider at page level (wraps toolbar + canvas)
- DB uses Proxy pattern for deferred connection (graceful without DATABASE_URL)
- All API routes use `getAuthUserId()` for ownership enforcement
- Undo/redo: 50-entry snapshot history in workflow store
- Shared DB schema (public.*), workshop-specific in workshop.* schema

## Environment
- `WORKSHOP_ENV` — local | dev | staging | prod
- `DATABASE_URL` — PostgreSQL connection string
- `AUTH_SECRET` — NextAuth JWT signing key
- `AUTH_PASSWORD` — Login password
- `NANOHYPE_SOURCE` — local | github (template catalog source)
- `NANOHYPE_LOCAL_PATH` — path to nanohype repo (defaults to ../nanohype/nanohype)
