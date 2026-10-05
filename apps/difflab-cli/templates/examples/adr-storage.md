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

### Object storage

- Good: Lifecycle rules remove expired exports without an application job.
- Bad: Requires bucket credentials and signed download URLs.

### Database

- Good: Existing backup process covers exports.
- Bad: Large blobs make backups slow and expensive.

## Decision Outcome

Chosen option: object storage, because it provides expiry policies and direct downloads without loading large files into application memory.

### Positive Consequences

- Large exports do not occupy application disks.

### Negative Consequences

- Download authorization requires short-lived signed URLs.

## References

- EX-41 — example export requirement.

## Appendix

### Appendix A

A seven-day lifecycle rule deletes exports even if a user never downloads them. Issue signed URLs only after checking that the requester owns the export.

### Appendix B

An export job records the object key and expiry time so the download endpoint can reject expired requests before generating a URL.
