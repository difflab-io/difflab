---
name: difflab-writing-style
description: Concise, diagram-first technical writing style for Difflab plans, reviews, tasks, and documentation.
---

# Difflab writing style

Apply `/simple-english` (`simple-english` skill) to all generated documentation, plans, tasks, review reports, and review comments. Keep every sentence short, active, and direct.

## Core rules

- Keep language simple and easy to follow on one read.
- Be as concise as possible. Never write walls of text.
- Lean on diagrams (Mermaid or Draw.io for complex visuals) instead of prose. Drop prose explanations when a diagram communicates the structure or flow.
- Use domain-appropriate terminology and the repository's chosen terminology when naming concepts or writing explanations.
- Format file trees and test trees with terse `[M/A/D/R]` notation (`[M]` modified, `[A]` added, `[D]` deleted, `[R]` renamed) to highlight changes. Group unchanged or bulk-affected paths at the directory level instead of listing every leaf.
- Use soft wraps for Markdown prose (one source line per paragraph). Keep structural line breaks for headings, lists, tables, code blocks, file trees, and diagrams.

## Tree notation

```text
[M] modified  [A] added  [D] deleted  [R] renamed
src/
├── [M] service.ts           owns policy (largest edit)
├── [A] store.ts             owns persistence
└── [M] adapters/            update provider bindings
```
