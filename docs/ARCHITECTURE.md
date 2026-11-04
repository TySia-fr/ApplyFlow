# Architecture

ApplyFlow is a **modular monolith**: one Next.js application, one PostgreSQL
database, one object store. No microservices, no Redis. Each piece is added
only when a concrete requirement needs it (see "Deliberately not used").

```
Browser
  │  HTTPS
  ▼
Nginx (TLS, rate limit, security headers)          ← TySia VPS
  │
  ▼
Next.js 16 app (Node, standalone output)
  ├─ src/app/            routes, layouts, UI (Server Components first)
  ├─ src/server/actions  Server Actions: parse input → call service → revalidate
  ├─ src/server/services business rules (pure of HTTP and React)
  ├─ src/server/db       Drizzle schema, client, queries scoped by userId
  ├─ src/server/auth     better-auth config + getCurrentUser() (Data Access Layer)
  └─ src/lib             shared pure code: Zod schemas, metric math, formatting
  │
  ├──► PostgreSQL 16   (all relational data, rate-limit counters, job queue later)
  └──► Document store  (private local volume or S3; served only via an authorized route, ADR-0003)
```

## Layering rule

`app/` → `server/actions` → `server/services` → `server/db`. Nothing goes the
other way. React components never import `db`. Route handlers and actions stay
thin: validate, authorize, delegate. This is what lets the services be
unit-tested without a browser or an HTTP server.

## Multi-tenancy and authorization

The tenant is the user. There is no workspace concept: no requirement calls for
shared data between users, and adding one later is a migration, not a rewrite.

Three layers, each sufficient to stop a cross-user read or write on its own:

1. **Data Access Layer.** Every query function takes the `userId` resolved by
   `getCurrentUser()` on the server. No function accepts a raw id from the
   client without pairing it with that `userId` in the `WHERE` clause.
2. **Composite foreign keys.** User-owned rows reference each other through
   `(user_id, id)`. The database rejects an application that points at another
   user's company or document, even if layer 1 has a bug. Verified by hand on
   the first migration (see `docs/PROJECT_PROGRESS.md`) and by integration tests.
3. **Automated cross-user tests.** Two users, every resource, every verb.

## Status history

`application.status` is the current state. `application_event` is the
append-only log of every transition, written in the same transaction as the
status change. Dashboards and analytics read the log, so metrics like
"response rate" are computed from what actually happened, not from the
current snapshot.

## Time

Timestamps are `timestamptz`, stored in UTC. Each user has an IANA timezone
preference used for display. Interviews additionally store the zone they were
scheduled in, so an interview set for 10:00 Paris stays 10:00 Paris after the
user moves to Montreal.

## Demo mode

Recruiters must be able to try the product without signing up. "Try the demo"
creates a real, isolated user flagged `is_demo` with seeded sample data and a
24-hour expiry. A scheduled cleanup deletes expired demo users (cascades remove
their data and documents). Demo users go through exactly the same authorization
code as real users; there is no "demo bypass".

## Rendering

Next.js 16 with Cache Components. Public pages (`/`, `/fr`, sign-in/up) are
fully static. App pages are a static shell with the session-dependent part
streamed behind `<Suspense>`; nothing per-user is cached on the server, so a
mutation only needs `refresh()`. Charts are server-rendered HTML/CSS with a
visually hidden data table, so no chart library ships to the browser. The
only substantial client component is the Kanban board.

## Internationalization

Typed dictionaries (`src/lib/i18n/en.ts`, `fr.ts`). `fr` is checked against
the English shape with `satisfies`, so a missing translation is a build
error; a unit test also checks placeholders match. Public pages are
localized by URL (`/`, `/fr`), app pages by the user's saved language.
Dates, numbers and currencies use `Intl` with the user's locale and timezone.

## Deliberately not used (yet)

| Not used | Why | Revisit when |
|---|---|---|
| Redis | Rate limits live in Postgres; no cache hot enough to need it | Measured latency or multi-instance pub/sub |
| Job queue service | Cleanup and reminders are cron-sized | Work that must retry or fan out |
| GraphQL | One first-party client; Server Actions + REST cover it | A third-party API consumer |
| Workspaces / teams | No requirement for shared data | A team plan |

Decisions with lasting consequences are recorded in `docs/adr/`.
