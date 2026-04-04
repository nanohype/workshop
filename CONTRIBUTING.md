# Contributing to Workshop

Thanks for your interest in contributing! Here's how to get started.

## Prerequisites

- Node.js 20+
- pnpm
- Docker (for PostgreSQL)
- Claude Code CLI installed and authenticated

## Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:push
pnpm dev
```

## Development

```bash
pnpm dev          # Start dev server
pnpm typecheck    # Type check
pnpm lint         # Lint
pnpm test         # Run tests
pnpm build        # Production build
```

## Project Structure

```
src/
  app/
    api/nanohype/   # Template and composite catalog endpoints
    api/workflows/  # Workflow CRUD and run endpoints
    api/runs/       # Run monitoring, streaming, file access
    workflows/      # Workflow editor and run pages
  components/
    layout/         # App shell, sidebar, header
    workflow/        # Graph canvas, node types, config panel, toolbar
    nanohype/       # Template browser, variable form, file preview
    ui/             # shadcn/ui primitives
  lib/
    engine/         # Graph execution engine (graph, scheduler, executor, sandbox)
    nanohype/       # @nanohype/sdk integration (catalog, composite-to-workflow)
    providers/      # Claude Code CLI provider
    store/          # Zustand stores (workflow, run, settings)
    db/             # Drizzle ORM schema (shared + workshop)
  types/            # TypeScript type definitions
```
