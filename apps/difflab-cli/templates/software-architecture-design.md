# [System or feature]: software architecture

## Overview

[State the purpose, system boundary, users, and explicit non-goals.]

## Requirement

### Functional

[List observable behavioral capabilities from a client, caller, or end-user perspective. Use plain bullets without `FR` prefixes. Put internal types, function names, configuration internals, file layouts, and code-style rules in Design and Implementation.]

- [Client or end-user capability and observable outcome.]
- [Additional client or end-user capability and observable outcome.]
- [Explicit behavioral boundary or rejection rule.]

### Non-Functional

[List performance, security, cost, isolation, and reliability characteristics from a client, caller, or end-user perspective. Use plain bullets without `NFR` prefixes. Put internal mechanisms in Design and Implementation.]

- [Observable performance, reliability, or cost bound.]
- [Observable security or isolation guarantee.]
- [Additional external operational characteristic.]

## Design

### Components and Responsibilities

[Draw a system diagram and list each component with its responsibility and relationships. Use Mermaid diagrams unless `AGENTS.md` states another format.]

> @agent: add example mermaid diagram

```mermaid

```

- [Component A handles this responsibility.]
- [Component A calls Component B for that responsibility.]
- [Component C stores this state.]

### Data and Control Flow

[Trace the main request or event path and name where state lives. If a flowchart or sequence diagram clarifies the path, include it.]

### Interfaces and Contracts

[List database entities, input and output schemas, endpoints, core types, and public methods. If data models change, include an entity-relationship diagram.]

## Implementation

### Important topic 1

[List owned modules, dependency direction, and extension points.]

### Important topic 2

[List operational rules, configuration internals, or code-level invariants.]

## References

- [Relevant code, ADR, or external specification.]
- [Related design document or issue.]
- [Applicable external standard or API contract.]
