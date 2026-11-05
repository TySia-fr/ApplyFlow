# Testing

| Layer | Tool | Where | What it proves |
|---|---|---|---|
| Unit | Vitest | `tests/unit` | metric definitions, DST-correct time conversion, file sniffing, filename sanitizing, validation (incl. `javascript:` URLs, mass assignment), FR/EN dictionary parity |
| Integration | Vitest + real PostgreSQL | `tests/integration` | services against a real database: cross-user access on every operation, status history and row locking under concurrency, Kanban ordering and renumbering, company dedupe, LIKE escaping, document versioning, cascading account deletion, demo purge, atomic rate limiting |
| End-to-end | Playwright + axe | `tests/e2e` | full user journey in a production build, cross-user access through the browser, account enumeration, security headers, demo sandbox, drag and drop, French UI, mobile layout, WCAG A/AA (serious/critical) on key pages |

## Running

```bash
# once: a separate database for integration tests
createdb applyflow_test
DATABASE_URL=postgres://…/applyflow_test pnpm db:migrate

pnpm test                          # unit + integration (uses TEST_DATABASE_URL)
pnpm build && scripts/serve-standalone.sh
pnpm exec playwright test          # E2E against http://127.0.0.1:3100
```

E2E needs `DEMO_RATE_LIMIT_PER_HOUR` raised (e.g. 1000) because every test
run starts several demos from one IP.

## Results at the time of writing (2026-11-04)

- `pnpm test`: **3 files, 37 tests passed**
- `pnpm exec playwright test`: **9 passed** (8 desktop, 1 mobile)
- The concurrency test was run 10 times in a row: 10/10 passed.

## Bugs these tests found during development

1. Dashboard crashed for any user with history: Postgres returned an enum
   array as a raw string. Fixed by casting to `text[]`.
2. Concurrent status changes produced timeline events in the wrong order
   (`now()` is transaction start). Fixed with `clock_timestamp()`.
3. Cards couldn't be dragged by their title, and drops landed in the
   neighbouring column (rect-based collision + eager auto-scroll). Fixed with
   pointer-first collision detection and a smaller auto-scroll zone.
4. The demo rate limiter failed intermittently under concurrent requests
   (duplicate-key error): better-auth's table has two unique indexes and
   `ON CONFLICT` arbitrates only one. Moved app limits to `app_rate_limit`
   with a single primary key (migration 0002); the test now fires 20
   concurrent calls in 5 rounds and was run 15 times in a row.

## Not covered yet

- Keyboard-only drag on the board (dnd-kit supports it; not asserted).
- Email verification / reset flows (no provider configured in tests).
- S3 storage driver end-to-end (local driver is what's tested).
- Load testing.
