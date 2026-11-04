# ApplyFlow

Job-search management for people who apply seriously: every application,
status change, interview and follow-up in one place, with metrics computed
from what actually happened.

> **Status:** Phase 1 of 5 (foundation). See
> [`docs/PROJECT_PROGRESS.md`](docs/PROJECT_PROGRESS.md) for what is done and
> verified, and [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) for
> what comes next. Nothing below is claimed until it ships.

## Stack

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript (strict) ·
Tailwind CSS 4 · PostgreSQL 16 · Drizzle ORM · better-auth · Zod ·
S3-compatible storage · Vitest · Playwright · Docker

## Architecture in one paragraph

A modular monolith. Routes and UI in `src/app`, business rules in
`src/server/services`, data access in `src/server/db`, with dependencies
pointing one way only. Every user-owned row carries `user_id`, and rows
reference each other through composite `(user_id, id)` foreign keys, so the
database itself refuses cross-user links. Status changes are recorded in an
append-only event log that the metrics are computed from. Details:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Local development

Requirements: Node 22, pnpm 10, PostgreSQL 16.

```bash
cp .env.example .env          # fill in BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm install
pnpm db:migrate               # apply migrations in ./drizzle
pnpm dev
```

| Command | Purpose |
|---|---|
| `pnpm typecheck` | TypeScript, strict |
| `pnpm lint` | ESLint |
| `pnpm db:generate` | SQL migration from schema changes |
| `pnpm build` | Production build |

## Decisions

- [ADR-0001](docs/adr/0001-drizzle-instead-of-prisma.md): Drizzle instead of Prisma
