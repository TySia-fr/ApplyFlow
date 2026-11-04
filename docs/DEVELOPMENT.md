# Development

## Setup

```bash
cp .env.example .env                       # set BETTER_AUTH_SECRET
createdb applyflow                         # or: docker compose up -d db
pnpm install
pnpm db:migrate
pnpm dev                                   # http://localhost:3000
```

Click **Try the demo** on the landing page to get a seeded account.

## Project layout

```
src/
  app/                 routes (public: /[lang]/…, app: /app/…, api: /api/…)
  components/          ui.tsx (design system), app/*, public/*
  lib/                 pure, shared: validation, metrics, time, files, i18n
  server/
    actions/           Server Actions (thin: auth → parse → service)
    services/          business logic, all functions take userId first
    db/                Drizzle schema + client
    auth/              better-auth config, getCurrentUser (DAL)
    env.ts logger.ts storage.ts email.ts errors.ts
tests/ unit/ integration/ e2e/ fixtures/
drizzle/               SQL migrations (committed)
```

## Conventions

- New user-owned table → `user_id` column, `UNIQUE (user_id, id)`, composite FKs
  to other user-owned tables, an integration test proving user B can't reach it.
- New user-facing string → add to `src/lib/i18n/en.ts`; TypeScript then fails
  until `fr.ts` has it.
- New mutation → schema in `lib/validation.ts`, service in `server/services`,
  action in `server/actions`. No business logic in components or actions.
- Pages that read the session must render under a `<Suspense>` boundary
  (Cache Components); the app layout provides one.

## Regenerating the landing screenshots

The images in `public/` are real screenshots of the demo dashboard. With the
production build running on :3100, sign into a demo in a 1440×900 viewport,
hide the demo banner, and capture the top 720 px in light and dark mode
(the snippet used is in the commit that added them).
