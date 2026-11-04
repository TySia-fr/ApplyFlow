# Project audit (2026-11-04, start of project)

## Starting point

Empty repository (`TySia-fr/applyflow` created the same day). No existing code,
schema, auth or deployment to preserve.

## Environment findings that shaped decisions

| Finding | Consequence |
|---|---|
| Next.js 16.4 with Cache Components on by default | Per-user pages render the session behind `<Suspense>`; public pages stay static (ARCHITECTURE.md) |
| Prisma's migration engine binary could not be downloaded in the dev environment | Drizzle instead, so every migration is generated **and applied** before commit (ADR-0001) |
| Google Fonts unreachable at build time | Fonts self-hosted via the `geist` package; the build has no external dependency |
| Single VPS already hosting other apps | Own compose project, own database, localhost-only port; nothing shared (DEPLOYMENT.md) |
| No email provider configured anywhere yet | Email features are conditional and say so in the UI |

## Scope decision

The brief listed ten modules. The MVP implements fewer, finished to the
definition of done, rather than all ten partially. See
IMPLEMENTATION_PLAN.md for what is in and what is deferred.
