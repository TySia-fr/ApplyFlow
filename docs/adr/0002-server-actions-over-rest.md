# ADR-0002: Server Actions for mutations, REST only where HTTP is the interface

Date: 2026-11-04 · Status: accepted

## Context

The brief asked for "REST or GraphQL" with OpenAPI docs. The only client is
the app's own UI.

## Decision

Mutations are Server Actions; reads are Server Components calling services
directly. HTTP routes exist only where a plain URL is the interface: health
checks, file downloads, and better-auth.

## Why

- One path for validation and authorization instead of a REST layer plus a
  client-side fetch layer that must agree with it.
- Forms work without client JavaScript and get pending states for free.
- Next.js checks the Origin of action requests (CSRF) and endpoints aren't
  guessable URLs.

## Consequences

- No public API today. Services take `(userId, input)` and return plain data,
  so a `/api/v1` adapter with token auth is a thin layer when a real consumer
  appears.
- OpenAPI covers the HTTP routes that exist (`docs/openapi.yaml`), not
  imaginary ones.
