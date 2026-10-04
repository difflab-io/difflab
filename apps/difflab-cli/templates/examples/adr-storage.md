# Use object storage for user exports

- **Status:** accepted
- **Deciders:** Platform team
- **Date:** 2026-01-14

## Context and Problem Statement

Exports may exceed the response size limit of the application server. Where should completed exports live until users download them?

## Decision Drivers

- Exports must expire after seven days.
- The application server should not retain large files on local disk.

## Considered Options

- Store exports in object storage.
- Store exports in the database.

## Decision Outcome

Chosen option: object storage, because it provides expiry policies and direct downloads without loading large files into application memory.

### Positive Consequences

- Large exports do not occupy application disks.

### Negative Consequences

- Download authorization requires short-lived signed URLs.

## Pros and Cons of the Options

### Object storage

- Good: Lifecycle rules remove expired exports.
- Bad: Requires credentials and bucket configuration.

### Database

- Good: Existing backup process covers exports.
- Bad: Large blobs make backups slow and expensive.

## Links

- EX-41 — example export requirement.
