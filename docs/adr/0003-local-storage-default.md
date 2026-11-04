# ADR-0003: Private local disk as the default document store, S3 as an option

Date: 2026-11-04 · Status: accepted

## Context

The brief preferred S3-compatible storage. The app runs on one VPS; a MinIO
container would add a service, credentials and memory for a few megabytes of
CVs.

## Decision

A `Storage` interface with two drivers selected by `STORAGE_DRIVER`:

- `local` (default): files in a private directory (`0700`/`0600`, Docker
  volume in production), keys generated server-side, traversal-checked.
- `s3`: any S3-compatible provider via the AWS SDK.

Downloads always go through the authorized route handler, for both drivers.

## Consequences

- One less moving part on the VPS; backups are a volume tarball.
- Horizontal scaling would require `s3` (two app instances can't share a
  local disk). Switching is configuration plus copying existing objects.
- The `s3` driver is not exercised by the test suite (no S3 endpoint in CI);
  it is a thin wrapper, but it is untested.
