# Project progress

## 2026-11-04 — Phase 1 (foundation)

Done
- Next.js 16.4.5 scaffold, TypeScript strict, Tailwind 4
- Drizzle schema: auth tables + company, application, application_event,
  interview, follow_up, document
- Migration `drizzle/0000_init.sql` generated and applied to PostgreSQL 16
- Environment validation with Zod

Verified by hand against PostgreSQL 16 (to be turned into automated tests):
- Application referencing another user's company → rejected by
  `application_company_owner_fk`
- Duplicate company name per user, case-insensitive → rejected by
  `company_user_name_uq`
- `salary_min > salary_max` → rejected by `application_salary_ck`

Decisions
- ADR-0001: Drizzle instead of Prisma

Known issues / risks
- No email provider yet: verification and password reset cannot ship as
  "done" until one is configured
- No automated tests yet
