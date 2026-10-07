# `adr new`

Write a decision from user guidance and evidence. Do not implement it.

1. Read `adr/README.md`, `adr/template.md`, and numbered records. Accept directory ADRs and legacy flat files. Prefer a supplied path or number, then a short name, then one topic match. `adr new auth` keeps `auth` as the name. A multiword request without `name:` is decision context. If several records match, ask. Reuse a matching blank scaffold. If it is already authored, offer `adr update`. Never overwrite a record or a directory that holds assets.
2. Ask for the problem, options, constraints, decision authority, and evidence when missing. With `adr new auth` alone, ask for decision context before creating or filling a record. State an outcome only when the user gives a choice or evidence for a proposed recommendation. If evidence is thin, offer `explore new`. Do not invent facts or approval.
3. If no scaffold matches, follow `init.md` to reserve the next directory. Scaffold `architecture-decision-record` as `ADR.md` through MCP. Read the result before editing. Do not migrate a legacy file. On failure, do not add an index row.
4. Fill the template with short sentences. Compare each option's Pros and Cons before the Decision Outcome. Keep status `proposed` unless approval is documented. Cite evidence and mark unknowns. Remove empty optional appendices. Use Mermaid for a useful diagram. Put static assets beside `ADR.md` and link to them with relative paths such as `./topology.svg`.
5. After authoring, update only the matching row in `adr/README.md`. For the first record, replace the `No ADRs yet.` row. Link a directory record as `(NNNN-title/ADR.md)` and a legacy file as `(NNNN-title.md)`. Keep rows in number order. If a row conflicts, stop and ask; do not erase another record.
6. Make sure that links work, placeholders are gone, and status matches the index. Report changed files. Do not commit or apply the decision.
