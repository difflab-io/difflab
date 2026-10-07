# `adr update`

Revise one existing ADR. Do not scaffold a new one or change its approval without evidence.

1. Confirm the repository root. Read `adr/README.md`, `adr/template.md`, and numbered records. Accept both `adr/NNNN-title/ADR.md` and legacy `adr/NNNN-title.md`. Select an explicit path or number first, then one unique topic match. If the target is absent or ambiguous, ask. Never edit `template.md`, a static resource, or a path outside `adr/`.
2. Read the whole ADR and the requested change. Ask what to change if the request is vague. Classify it as new evidence, a clarification, a changed decision, or an explicit status change. Preserve prior rationale, status, and history unless the user requests a change. Ask before superseding another ADR. Calculate links from the source file. A directory record uses `../NNNN-title/ADR.md` or `../NNNN-title.md`. A legacy flat file uses `NNNN-title/ADR.md` or `NNNN-title.md`.
3. Before editing either file, check the matching row in `adr/README.md`. If it is missing, duplicated, or linked to another record, stop and ask how to repair it. This check prevents a changed ADR from being left with an inconsistent index. Do not migrate legacy records without a separate request.
4. Make the smallest supported edit. Keep the record's headings and links to adjacent diagrams or assets. If the decision or status changes, append a dated `## Decision History` entry. State the old and new outcome, reason, and evidence; keep earlier entries. Update the main date. Never silently reset accepted to proposed or infer approval from prose.
5. If status or summary changed, update only the checked index row. Keep its correct relative link. Make sure that status and links agree before reporting changed paths. Do not commit or implement the decision.
