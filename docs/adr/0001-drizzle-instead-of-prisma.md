# ADR-0001: Drizzle ORM instead of Prisma

Date: 2026-11-04 · Status: accepted

## Context

The initial brief preferred Prisma. Prisma's migration tooling depends on a
native schema-engine binary downloaded at install time from Prisma's own CDN.
In the development environment that CDN was unreachable, so migrations could
not be generated or verified. Shipping migrations that were never run against
a real database is not acceptable.

## Decision

Use Drizzle ORM with drizzle-kit.

- Pure TypeScript, no native binary, installs from npm only.
- Schema is TypeScript, so types flow from the table definition with no
  generate step.
- Generated migrations are plain SQL files that can be reviewed in a PR.
- Supports what the design needs: composite foreign keys, partial indexes,
  expression indexes, check constraints.
- better-auth ships an official Drizzle adapter.

## Consequences

- Less "magic" than Prisma for nested writes; multi-step writes use explicit
  transactions, which is what this codebase wants anyway.
- No Prisma Studio. `drizzle-kit studio` exists if needed.
- The author's other project (NEXORA) uses Prisma 7, so the portfolio shows
  both tools.
