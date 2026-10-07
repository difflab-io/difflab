# `adr init`

Create a blank ADR. Do not fill it, change code, or add an index row.

1. Confirm the repository root. Read `adr/README.md` and `adr/template.md`. Count numbered ADR directories and legacy `NNNN-title.md` files. Include reserved or incomplete directories. Use the next number after the highest; never fill gaps. If a number is duplicated or exceeds 9999, stop and ask.
2. Prefer the supplied name: `adr init auth` uses `auth`. Otherwise derive a safe lowercase slug from the topic. If no topic or name is given, ask. Look for existing records about the same decision, even under another title. If one draft matches, offer `adr new`; if several match, ask. Do not create a duplicate.
3. Reserve `adr/NNNN-title/` with exclusive, non-recursive directory creation. Do not use `mkdir -p`. If that path exists, stop and check for a collision. Use MCP `scaffold({name:"architecture-decision-record",cwd:<absolute root>,path:"adr/NNNN-title",filename:"ADR.md"})`. Never overwrite a file or enter an existing directory. If scaffolding fails, leave the reserved directory for safe recovery.
4. Read the generated `ADR.md`. If an installed custom template lacks context or status, report it. Leave all placeholders. The README index remains unchanged until authoring.

Example: if 0001 and 0003 exist, `adr init queue ownership` creates `adr/0004-queue-ownership/ADR.md`.
