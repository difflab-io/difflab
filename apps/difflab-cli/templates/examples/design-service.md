# Notification service — software architecture

## Overview

The service delivers email notifications for account events. It consumes messages from the application queue; it does not decide who should receive a message.

### Context

The account service publishes events. The notification service sends mail through a provider and records delivery attempts.

### Technology Stack

| Layer    | Choice        | Reason                                                  |
| -------- | ------------- | ------------------------------------------------------- |
| Queue    | Durable queue | Retry transient provider failures.                      |
| Delivery | Email API     | Keep provider credentials outside application services. |

## Design

### Components and Responsibilities

| Component     | Responsibility                  | Public interface  |
| ------------- | ------------------------------- | ----------------- |
| Consumer      | Validate and deduplicate events | `handle(event)`   |
| Sender        | Format and send mail            | `send(message)`   |
| Attempt store | Record outcomes                 | `record(attempt)` |

### Data and Control Flow

An account event enters the queue, the consumer validates its schema, the sender submits mail, and the attempt store records the result. A failed transient request is retried; a permanent rejection is reported.

### Interfaces and Contracts

Events carry an ID, type, recipient, and timestamp. An event ID is processed at most once. Provider credentials never enter event payloads.

### Alternatives and Trade-offs

Sending email synchronously would simplify operations but delay account requests when the provider is slow. The queue adds operational cost in exchange for isolation.

## Implementation

### Dependencies and Repository Layout

The account service imports only the event contract. The notification service owns its consumer, sender, and attempt store.

### Operations

Alert on a growing queue and repeated provider failures. Disable sending and drain pending work if credentials are compromised.

### Quality Attributes

Deduplication protects against queue redelivery. Load tests cover bursts; integration tests simulate provider timeouts.

## References

- EX-34 — example notification requirement.
