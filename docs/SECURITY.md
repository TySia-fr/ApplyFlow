# Security

This document lists what is in place, how each item is verified, and what is
known to be missing. Implementing these measures does not make the
application "secure"; it makes specific classes of bugs unlikely.

## Threat model in one line

Multi-tenant app holding personal data (CVs, job history). The main risks are
**one user reading or changing another user's data**, account takeover, and
malicious uploads.

## Controls

| Risk | Control | Verified by |
|---|---|---|
| Broken access control / IDOR | Every query is scoped by the `userId` from the server session (`requireUser()`); the client never sends a user id. Missing and foreign ids return the same 404. | `tests/integration/services.test.ts` (authorization suite), `tests/e2e/security.spec.ts` |
| Cross-user links if a check is forgotten | Composite foreign keys `(user_id, id)` between user-owned tables: the database rejects them. | Manual SQL check (PROJECT_PROGRESS), integration tests |
| Mass assignment | Zod schemas whitelist fields; `userId`, `isDemo`, etc. are never read from input (`input: false` in better-auth). | `time-files-validation.test.ts` |
| SQL injection | Drizzle parameterizes every value; LIKE wildcards in search are escaped. | integration test "treats LIKE wildcards literally" |
| Stored XSS | React escapes output; no `dangerouslySetInnerHTML`. URLs accepted only with `http(s)` scheme, so no `javascript:` hrefs. | unit test on `applicationInput` |
| CSRF | Server Actions are POST-only with Origin checking by Next.js; session cookie is `SameSite=Lax`, `HttpOnly`, `Secure` in production. | framework behaviour |
| Brute force / credential stuffing | better-auth rate limits stored in Postgres: sign-in 5/min, sign-up 3/min, password change 5/min per IP. Demo creation limited per IP per hour. | integration test on the counter |
| Account enumeration | Identical message for wrong password and unknown email; sign-up never says "email taken". | E2E "sign-in errors don't reveal…" |
| Session theft | HTTP-only cookies, 7-day expiry, sliding once a day; password change revokes other sessions. | config |
| Malicious uploads | Type decided from file bytes (PDF/DOCX/PNG/JPEG only), 10 MB cap enforced on server and DB, random storage keys, never served inline: `attachment` + `nosniff` + `sandbox` CSP. | unit tests on `sniffType`, E2E spoofed upload |
| Path traversal in storage | Keys are server-generated; the local driver additionally refuses keys resolving outside its root. | code review |
| Sensitive data in logs | Logger redacts keys matching password/secret/token/cookie/key. | code review |
| Secrets in the client bundle | All secrets read in `server-only` modules; env validated at boot. | build (server-only import guard) |
| Clickjacking, sniffing, referrer leaks | CSP `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, HSTS, `Permissions-Policy`. | E2E "security headers are set" |

Security-relevant events (`sign_in_failed`, `authz.not_found`,
`document_denied`, `password_changed`, `account.deleted`, `demo.rate_limited`)
are logged as JSON lines with `"msg":"security"`.

## Known limitations

- **CSP allows `'unsafe-inline'` scripts.** Next.js streams data in inline
  scripts; removing this needs per-request nonces, which disables static
  rendering. External script sources are still blocked.
- **No email provider configured by default.** Without `RESEND_API_KEY`,
  email verification and password reset are off, and the sign-in page says so.
- **No 2FA.** better-auth has a plugin; not enabled yet.
- **Rate limits are per IP.** Behind Nginx, `X-Real-IP` must be set by the
  proxy (see DEPLOYMENT.md), or every client shares one bucket.
- **Uploaded files are not virus-scanned.** They are never executed or served
  inline, but a user downloading their own file gets it as uploaded.
- **Demo accounts** are real accounts with a 24-hour expiry; expired ones are
  purged opportunistically when a new demo starts, not by a scheduler.
