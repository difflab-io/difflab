---
name: difflab-writing-style
description: Concise, diagram-first technical writing style for Difflab plans, reviews, tasks, and documentation.
---

# Difflab writing style

Apply `/simple-english` (`simple-english` skill) to all generated documentation, plans, tasks, review reports, and review comments. Keep every sentence short, active, and direct. Write one paragraph per source line with soft wraps.

## Core rules

- Keep language simple so a reader understands it on one read.
- Stay concise and never write walls of text.
- Use Mermaid or Draw.io diagrams instead of prose, and drop prose explanations when a diagram shows the structure or flow.
- Use domain terminology and the repository terminology when naming concepts.
- Write `Requirement` and `Requirements` sections as plain bullets without `FR` or `NFR` prefixes.
- State observable behavior and performance, security, cost, isolation, and reliability characteristics from a client or end-user perspective in requirements.
- Keep internal types, function names, CLI flags, configuration internals, file layouts, and code-style rules in `Design`, `Implementation`, or `Phases`.
- Format file and test trees with `[M]` modified, `[A]` added, `[D]` deleted, and `[R]` renamed markers.
- Group unchanged or bulk-affected paths by directory instead of listing every file.
- Use soft wraps for Markdown prose while keeping structural line breaks for headings, lists, tables, code blocks, trees, and diagrams.

## Tree notation

Use this `[M/A/D/R]` tree format to summarize repository and test changes. Group unchanged paths by directory. Mark the largest edit in a short note.

```text
[M] modified  [A] added  [D] deleted  [R] renamed
src/
├── [M] service.ts           owns policy (largest edit)
├── [A] store.ts             owns persistence
└── [M] adapters/            update provider bindings
```
