# Preserve raw sources and human provenance alongside wiki pages

- **Status:** draft
- **Branch:** feature/sources
- **Issue:** none

## Intent

Preserve the evidence from which wiki pages are written, separately from the concise pages readers consume. A future author should be able to inspect original instructions, code, rationale, and external excerpts, understand why a page changed, and use the retained material to write it again. Learning should preserve what users requested and what sessions/tools/source files actually showed, with no free-form LLM judgments or inferred preferences recorded as knowledge. This change establishes the filesystem format, CLI scaffolding, and authoring/maintenance workflows. A metadata viewer and automatic regeneration come later.

Also fix the current knowledge base's generic index titles and start every sidebar folder collapsed.

## Requirements

1. Use `resolveHome()/meta`, normally `~/.diffwiki/meta`; honor `DIFFWIKI_HOME`. Treat the request's `~/.diffiwiki` spelling as a typo.
2. Mirror each registered collection and every real Markdown/MDX page at its exact collection-relative path. Include root/nested index pages, README pages, drafts, and system-audience pages, even though some are omitted from navigation. Support global, repo, and external collections; content remains in its registered location.
3. Support evidence about a whole collection and evidence about a particular page. Maintain an overall `meta/META.md` source index, collection source indexes, and per-page manifests. Collection indexes must also enumerate their page-scoped evidence: “recorded at both levels” does not mean duplicating raw snippets.
4. Prioritize near-verbatim user requests, raw session/tool outputs, original source snippets, and explicitly stated human rationale. Preserve role, sequence, and context; do not replace them with an LLM's summary, inferred intent, causal explanation, preference, or generalized lesson. Eliminate free-form agent interpretation from source and learning templates; retain only clearly identified mechanical action/result metadata. Do not apply article brevity, formatting, or plain-English rewrites to captured evidence.
5. Retain dated excerpts from web pages, documentation, and papers with URLs and sufficient locators/version metadata to find the originals when possible. Clearly label excerpts, snapshots, omissions, extraction changes, and retrieval failures.
6. Ship `history-template.md`, `external-source-extract-template.md`, and a dedicated `dream-learning-template.md`. Follow the existing convention: the CLI resolves paths and creates scaffolds; skills fill provenance content. Explicitly permit editing these metadata records directly while keeping article mutations CLI-owned.
7. Make capture part of dw-remember CREATE and UPDATE and dw-dream maintenance, including research when requested. Pass original evidence through dw-learn instead of losing it during transcript/notes summarization. A summary transcript or assistant answer is not independent evidence for a learned claim.
8. Preserve previous raw source records on article updates/removals. Make dream learning records individually inspectable, editable, rejectable, and removable by the user without deleting their underlying raw sources. Exclude rejected/removed learnings from subsequent maintenance and do not recreate an equivalent learning from the same cited evidence. Missing historical provenance remains missing; creating an empty manifest is not evidence backfill.
9. Repair the identified local collection/folder titles without moving pages or changing their bodies, audience, status, tags, or other metadata. Keep all sidebar folders collapsed initially, with manual expansion/navigation intact.
10. No metadata UI, new search index, background watcher, crawler, remote archive dependency, automatic page regeneration, or unrelated fix for the earlier `ui up` issue.

## Design

### Big Ideas

#### 1. Mirror files as files; put evidence in a separate namespace

The first plan converted article filenames into directories. Instead, mirror each article with a Markdown manifest at the same relative filename. This preserves a familiar path and avoids mixing generated indexes and source-record directories with article names.

```text
~/.diffwiki/meta/
  META.md                                      # overall collections/source index
  typescript/
    index.md                                   # manifest for collections/typescript/index.md
    commander-cli/
      index.md                                 # manifest for the folder's authored index
      add-command.md                           # manifest for this page, not a copy of its body
    .meta/
      META.md                                  # collection sources + all page manifests/records
      records/
        <UTC-timestamp>-<random-id>.md          # history, external extract, or dream learning
      attachments/
        <record-id>/...                        # optional original text/HTML/PDF/code captures
      dream-dismissals.json                    # IDs/evidence keys of user-dismissed learnings
```

For repo/external collections, derive the relative page path from `CollectionEntry.path`, not from `~/.diffwiki/collections` or the URL slug. Preserve case and extension; `a.md`, `a.mdx`, and `a/index.md` are separate identities. Index pages must be inventoried from actual files: `listArticleTree` deliberately drops them and cannot be the reconciliation inventory.

`.meta` is reserved for metadata internals, consistent with the browser skipping hidden content. Preflight path conflicts, unsafe collection names, case-insensitive filesystem collisions, and source/meta overlap before writing. Report an actionable error rather than slugifying names, merging identities, following escaping symlinks, or overwriting a conflicting file. Normal existing collection names retain the exact requested layout. Do not broaden collection naming rules across the project as part of this feature.

Record the collection name and registered content root in its index. If a name is later reused for a different root, stop and report the identity change rather than silently attaching old evidence to a new collection. A deliberate metadata relocation/rebind command is deferred.

#### 2. Preserve raw records; distinguish dream learnings; rebuild indexes

Each record has a schema version, unique ID, kind, collection, optional exact `article_path`, UTC `captured_at`, and `capture_status: incomplete | complete`. An absent article path means collection scope; `index.md` means the actual index article and is not collection scope. Add optional session/event locators, `source_records` links, superseded-record IDs, and article revision hashes when available. Source links identify collection, record ID, and excerpt locator so a merge can retain references across collections without moving/copying original records.

Use three kinds, with different retention/review rules:

| Kind | Content retained | Provenance required when available |
| --- | --- | --- |
| `history` | Verbatim user requests and explicitly stated rationale; source snippets and observed session/tool-output excerpts; factual action/result log | Speaker/role, original event time, session/message reference; command/exit status; code repository, commit, dirty-worktree state, file/symbol/line range; article before/after hashes |
| `external-source-extract` | Exact retrieved excerpt and optional original capture; extraction context and limitations | Requested/resolved URL, title, author/publisher, publication/version date, retrieval timestamp, heading/page/line locator, capture format and attachment checksum |
| `dream-learning` | One small, evidence-backed maintenance/learning record with raw excerpts and exact proposed/applied changes; no free-form inferred lesson | Dream run ID/time, triggering request or validation output, source-record/excerpt links, affected pages and before/after hashes, operation/outcome, review status; always identified as agent-created |

Raw records are authoritative as captures of what was said/observed, not proof that every quoted statement is true. In particular, quote an assistant message only with its original role and an explicit generated/unverified label; it cannot substantiate a learned fact without independent user/source/tool evidence. A single successful command establishes that observed result, not a generalized rule. Preserve relevant surrounding input/output and counterevidence; if a purported learning requires inferring intent, causality, or a preference, omit that claim and identify the missing evidence.

Unknown authors, source dates, commits, or versions remain explicitly unknown. A capture timestamp is not the original event/publication time. For dirty source files, store the actual observed snippet and say it differs from the commit; a repository commit alone is insufficient provenance. An external reference that could not be fetched can have a locator and a failure note, but must not be marked as a captured excerpt.

Preserve quotation/code contents and whitespace. Use fences long enough to contain embedded fences; do not silently reflow source code or user messages. If extracting text from HTML/PDF changes representation, identify the extraction method and call it extracted text rather than original bytes. Optional attachments retain raw bytes; their checksum applies to those bytes, not a normalized Markdown rendering. Preserve existing secret-redaction behavior and mark redactions explicitly.

Skills may fill an incomplete scaffold, including its provenance fields and completion marker. Once a raw `history` or `external-source-extract` record is complete, do not replace its evidence: later corrections or recaptures get a new record linking the old one. Dream learning records are explicitly different: users can edit their content, change their review status, or remove them. Autonomous dream runs cannot rewrite existing completed records or remove any learning/source record. IDs and target identity are CLI-owned. Do not pass record bodies through article serializers or article linters.

The `dream-learning-template.md` has a neutral source-derived title and these sections: `Raw user requests`, `Raw session/tool outputs`, `Source snippets`, `Source record links`, and `Proposed/applied change`. The last section contains exact affected paths, patch/command or factual operation, and observed outcome; it has no open-ended conclusions or recommendations. The header includes `kind: dream-learning`, `created_by: dw-dream`, `run_id`, `review_status: unreviewed | reviewed | rejected`, and proposed/applied/partial outcome. Missing evidence sections say `not captured`; never fill them with reconstructed quotations. One record covers one inspectable action or narrowly scoped evidence item, not an opaque whole-run essay. Raw excerpts may be included for inspection but must link to preserved primary captures when available.

List dream learning records in a separate, clearly labeled section in overall/collection/page indexes, showing ID, path, affected pages, run, completion, and review status. A complete record remains unreviewed until the user explicitly reviews it; neither the CLI nor dream may mark it reviewed implicitly. Even a reviewed dream record is not a replacement for original sources. Future dream runs read underlying raw evidence rather than recursively turning their own past summaries into new facts.

Users may edit a dream record's body/review fields directly and reindex. Reindex must preserve those edits and exclude rejected records from active learning/source listings while keeping them inspectable in a rejected section. An explicit user-driven `meta remove` deletes only a selected dream record and records a compact dismissal (ID plus a deterministic evidence/action key, no removed prose). The key uses the affected target(s), operation, and original source event/file/version locators plus exact excerpt hashes, not generated wording, transient record IDs, capture/run timestamps, or review status. Recapturing the same material with a new UUID must not bypass a dismissal. Keep the original key associated with a record when its user-editable prose changes. Reindex removes stale active links; subsequent dream runs skip existing/rejected/dismissed keys instead of regenerating paraphrases of the same learning. New evidence may justify a distinct candidate but never silently restore a removed record. Original source records and their attachments stay untouched. No automatic metadata garbage collection is added.

Learning-record removal does not roll back previously edited articles. Report the affected article paths/hashes and broken dependencies; any article correction/reversion is a separate explicit operation. If removal/index refresh is interrupted, the recorded dismissal takes precedence on reindex and dream intake, even if the old record file still exists.

An individual page's history event or dream learning can reference collection-wide source-record IDs. Thus a shared instruction or documentation capture can be stored once and linked by later page events. The collection index aggregates all three kinds and both scopes, keeping raw sources separate from dream learnings; page manifests list direct records and linked collection evidence. A reference to a rejected, dismissed, or missing dream record is not usable evidence and is reported for review rather than silently followed.

#### 3. Reconciliation is explicit and repairable

`meta init` inventories registered collection roots and ensures missing mirrored manifests/indexes. It never fabricates source history, copies article prose as “original evidence,” or rewrites source records. New article creation and collection registration also ensure the relevant mirror, so normal CLI writes do not rely on a later full scan. A manual/editor-created article is covered on the next explicit reconciliation; no automatic scan runs on every command or browser request.

Separate low-level metadata storage, which accepts a resolved collection entry, from target resolution/registry orchestration. Avoid a `registry -> meta -> collections -> registry` import cycle. Cover persistent registration through `createCollection`, `initRepoWiki`, and `addExternalCollection`; do not add side effects to `writeRegistry` or the temporary registry used by `seedProjectHome`. Preview/export must remain read-only toward persistent provenance.

A registry/article mutation can succeed before a metadata write fails. Return a clear partial-success error naming the saved article/collection and the reconciliation command; do not pretend nothing changed, delete the successful content, or silently swallow the failure through plugin hooks. Retrying metadata setup is non-destructive. On article updates, ensure a missing mirror without modifying previous evidence; do not create synthetic “user rationale” for arbitrary CLI edits.

Generate manifest/index record listings deterministically from source-record headers and references. Preserve human notes outside clearly marked generated sections. Use atomic replacement and a small, scoped metadata-write lock for cooperating CLI writers; report lock contention and leave records repairable. A crash after record allocation but before index refresh leaves a discoverable record that `meta reindex` repairs. Do not promise a cross-file transaction.

Retain raw evidence and manifests when a page disappears or a collection is deregistered; mark their availability in regenerated indexes. This default retention does not prevent the user's explicit removal of a dream learning. Reindex considers both registered collections and retained metadata collections, so deregistration cannot make old evidence disappear from the overall index. Allow reindexing or removing an existing dream record in a metadata collection even when it is no longer registered; allocating new records still requires a registered target. Never repurpose an old manifest because a URL slug happens to match. Rename/move inference and general garbage collection are deferred.

#### 4. Capture evidence before it is distilled

dw-remember prepares a raw evidence packet before research/authoring discards details. Keep it in a named local staging file until the durable metadata records and indexes are verified. For UPDATE, read the existing article and its metadata, preserve the raw new instructions/code, and note the pre-update article hash. For CREATE, use the actual path returned by the CLI rather than recomputing a slug.

After the article is saved as a draft, scaffold/fill the page records, add genuinely collection-wide records where appropriate, link shared source IDs, record the resulting article hash, and reindex. A successful article write followed by capture failure is an incomplete operation: report the article and staging paths, retain the packet, and give the exact retry step. This includes a partial-success error from automatic mirror setup: use the saved path named by that error. Do not create another article on retry or claim provenance capture succeeded. On capture retries, reuse any allocated record ID/path retained in the packet instead of creating duplicate events.

Existing raw evidence remains unchanged during article tightening. Pass only relevant evidence to the author/reviewer; raw records are not constrained by the article's token budget. A summary transcript or a list of URLs alone is not a substitute for original messages, code excerpts, or retrieved text. Remove inference-oriented prompts such as “root cause,” “decisions and patterns,” or “why this happened” from capture/mining unless a specific original user statement or source explicitly supports them. A short inventory/label may help routing; every durable claim must be traceable to actual quoted material or observed results. The LLM can select/organize evidence without storing its own judgments as facts.

#### 5. Dream maintains pages from evidence and leaves reviewable learning records

dw-dream currently calls `article update` directly, so improvements to dw-remember alone do not cover its writes. Update both `skills/dw-dream/SKILL.md` and `references/cycle.md` explicitly. Before an improvement, merge, or deprecation, read the affected pages' raw metadata and relevant collection evidence; honor user review/dismissal markers. Let lint and directly observed validation results identify a concrete problem. A missing source, apparent duplicate, or contradictory input is not permission to infer a cause or invent a rule: keep unsupported changes as proposals or skip them with the missing evidence noted.

For each actual maintenance change, preserve any newly used raw user requests/outputs/snippets in history/external records and create one `dream-learning` record linking them. Record the exact proposed/applied patch, operation, affected pages, and before/after hashes. For merges, link the survivor to both pages' original evidence and record the survivor/deprecated targets; leave both source histories in place. Deprecation preserves evidence, and no automatic article publication/deletion is introduced. Newly fetched docs become new extraction records, not replacements for older captures.

Do not create records for no-op checks or emit speculative “lessons learned.” A bounded pass reports learning record IDs/paths so users can inspect/edit/remove them. Changes still produce article drafts or deprecations, and the records identify their outcome without claiming human approval. Partial writes retain their raw packet/record ID for repair instead of duplicating actions on retry.

Expand dream's current mutation allowlist narrowly to permit metadata scaffold/fill/reindex alongside its existing draft/deprecation updates. Record removal and review promotion remain user-directed operations, never scheduled/autonomous dream behavior. In `--dry-run`, write only the existing proposal artifact, including the exact evidence excerpts/locators and proposed learning record; do not capture via dw-learn, allocate metadata records, mark review status, reindex, or change articles. Proposals do not enter future learning as evidence of an applied result.

### Infrastructure Changes

No service or database. Add a filesystem module to core, three bundled metadata templates, a compact per-collection dream-dismissal file, CLI commands, and skill instructions. Respect `DIFFWIKI_HOME` for metadata, templates, staging, and dream proposals. Keep metadata outside registered article roots; never register `meta` as a collection or add it to static output.

Tests use temporary homes and temporary content roots. The live title repair is a separate implementation step after the title-preserving writer has been validated; planning itself does not modify the user's knowledge base.

### Interfaces

Proposed public commands:

```sh
# Mirror existing registered collections; an optional name limits scope.
diffwiki meta init [collection] [--json]

# Allocate an incomplete record and return its path for the skill to fill.
# A collection alone means collection scope; a file path means page scope.
diffwiki meta new typescript --template history --json
diffwiki meta new typescript:commander-cli/add-command.md --template history --json
diffwiki meta new typescript:commander-cli/add-command.md --template external-source-extract --json
diffwiki meta new typescript:commander-cli/add-command.md --template dream-learning --json

# Rebuild source listings after direct record completion or an interrupted write.
diffwiki meta reindex [collection] [--json]

# User-directed removal of one dream learning; preserves original source captures.
diffwiki meta remove typescript:<record-id> [--json]

# Discover metadata templates separately from normal article shapes.
diffwiki templates list --category meta --json

# Change a display title without changing its filename.
diffwiki article update react:index.md --title React
```

- Require an explicit relative `.md`/`.mdx` filename for page-scoped metadata targets. Do not resolve the route `guide` ambiguously between `guide.md` and `guide/index.md`. Unknown collections or missing target files fail before record allocation.
- `meta init` creates missing manifests and refreshes indexes; it reports created/kept paths, pages with no evidence, and any unavailable roots. An unreadable collection root is an error, not an empty collection. Continue evaluating independent collections and return a failing exit code if any fail.
- `meta new` allocates with exclusive creation and a UTC timestamp plus random ID, seeds an incomplete record from the requested template, and updates source listings. It performs no network request. JSON includes record ID/path, resolved target, mirror path where applicable, and index paths; diagnostics go to stderr.
- `meta reindex` validates required record identity/scope/reference/review fields, includes incomplete captures with a visible marker, separates dream learnings from raw sources, and respects rejection/dismissal records. It reports malformed records/broken references without discarding them. It must not “repair” raw source bodies, overwrite edited dream records, or resurrect removed learnings. Source text itself is never interpreted as commands or authoring instructions.
- `meta remove <collection:record-id>` is restricted to `kind: dream-learning`. Under the existing metadata lock, write the dismissal before unlinking the record, then refresh indexes. It is idempotent for an already-dismissed ID and refuses raw-source IDs, path traversal, or out-of-scope paths. Return the removed record ID/path, preserved source IDs, affected articles, and unresolved dependent links. Do not delete shared attachments, source records, or article content; a partially completed removal remains suppressed and is repairable by reindex. Skills must not call this autonomously.
- Metadata templates declare `category: meta`; legacy templates without a category remain article templates. Default `templates list` continues to show article shapes. Add `--category article|meta|all` and an effective `path` in JSON. Resolve user templates over bundled defaults consistently for both listing and scaffolding. Keep no-overwrite seeding and do not extend article budget/lint rules in this work.
- The title writer changes only the title value, using YAML-aware editing with preserved body bytes and unrelated keys/comments. If a request combines title with body/tags/status, apply the requested fields through a preserving mutation; merely reordering the existing fixed-field serializers would still discard unrelated metadata. Preserve body bytes whenever the body was not explicitly replaced and validate combined updates separately. Avoid unrelated refactors of other authoring commands.
- Internal module boundaries: `paths.ts` for meta locations, `meta.ts` (split if needed) for storage/index/record contracts, core exports in `index.ts`, and command orchestration in the CLI. The exact exported function names are an implementation choice; the storage and command contracts above are fixed by this plan.

### Consequences

- The metadata path for an article is a manifest, while raw captures live under its collection's hidden `.meta/records`. This keeps exact path mirroring without filename-as-directory collisions.
- All source content stays local and is excluded from normal browse, search, graph building, article lint, and static export. This remains true even for published/public articles.
- Metadata is in the global home even for repo wikis, so the repo's Git history will not back it up. Document copying/backing up the whole metadata tree, including attachments.
- This provides auditable inputs and revision relationships, not a claim that arbitrary webpages can always be recovered or that generated prose can be reproduced byte-for-byte. Full article revision snapshots and automatic regeneration are separate features.
- Source records may be incomplete or unavailable. Manifests distinguish “no capture,” “incomplete capture,” and “captured evidence” rather than implying full historical coverage.
- Raw captures and dream learnings have intentionally different lifecycles. The former preserve original evidence; the latter remain user-editable/removable and are never treated as independent confirmation of the model's prior statements. Removing a learning cleans up its influence on future maintenance but does not silently undo article changes already made.
- Eliminating unsupported inference may produce fewer learnings and more explicit missing-evidence reports. This is preferred to accumulating plausible model-generated conclusions. Derived article prose may organize supported facts, but capture/mining does not synthesize unstated preferences, causes, or recommendations.
- No automatic semantic retitling or app-level override of meaningful authored titles. Repair the actual data and fix authoring guidance; missing-title fallback remains compatible with existing behavior.

## Phases

Preserve these three phases and keep every implementation checkbox unchecked until execution. Use existing mise tasks; do not install dependencies or run implementation checks just to revise this plan. No commit or push is authorized.

### Phase 1: Metadata storage, mirroring, and recoverable indexes

- [ ] Add meta path helpers, record/manifest types, and schema-v1 storage in core. Implement exact relative-file mapping, a filesystem inventory including index/README pages, explicit collection/page scope, collision preflight, and containment checks.
- [ ] Implement `ensureCollectionMeta`/`ensureArticleMeta`-equivalent low-level operations without registry dependencies. Create empty mirrors with an honest “no source history captured” state; preserve existing files and human notes.
- [ ] Implement exclusive record allocation, template-body preservation, record-header validation, cross-collection source/excerpt links, and deterministic generated listings for all three kinds. Separate raw evidence from dream learnings, preserve direct record edits, and refuse conflicting identity changes. Mark malformed/incomplete records in diagnostics without deleting them.
- [ ] Add atomic index writes and bounded scoped locking for cooperating CLI operations. Ensure a later reindex discovers records left by interruption; source bodies and attachments are never reformatted during reindex.
- [ ] Connect persistent collection registration and article create/update paths to lightweight metadata setup. Cover repo/external roots and existing files at registration; leave `writeRegistry`, `seedProjectHome`, navigation, and export free of persistent side effects. Surface partial-success errors and a repair command.
- [ ] Preserve raw metadata through article removal/collection deregistration and report unavailable targets. Add narrowly scoped dream-learning rejection/removal support, deterministic evidence/action keys, and atomic dismissal storage under `.meta/dream-dismissals.json`. Keep rejected/removed learnings out of active inputs, including interrupted removals; preserve raw sources, attachments, and edited learnings. No rename inference, collection rebind, general source deletion, or automatic garbage collection.
- [ ] Validation
  - [ ] Core tests in a new `meta.test.ts` cover exact nested/extension/index/README mapping, external roots, all audiences/statuses, idempotence, absent versus unreadable roots, path/symlink/case collisions, source/meta overlap, and no invented evidence.
  - [ ] Verify raw code/messages with embedded fences and whitespace remain unchanged; test incomplete/malformed captures, shared collection references, retained orphaned records, same-time allocations, simultaneous index writers, and recovery after record creation/index failure.
  - [ ] Test dream record edits survive reindex; completion never implies review; rejection/removal leaves original captures untouched, cleans active links, reports dependencies/affected pages, and survives an interrupted unlink/index refresh. Test removal cannot escape its collection or delete raw records; repeated removal is idempotent and dismissal keys do not depend on generated prose.
  - [ ] Exercise collection/article entry points with temporary homes and inject a metadata failure to assert partial-success reporting. Confirm temporary project registry seeding does not touch the persistent home.

### Phase 2: CLI scaffolding, templates, and authoring provenance

- [ ] Add `meta init/new/reindex` and user-directed dream-learning `meta remove` under the existing Commander/error-handling conventions. Resolve exact file/record targets safely and support the JSON contracts above; keep stdout usable by skills.
- [ ] Bundle `history-template.md`, `external-source-extract-template.md`, and `dream-learning-template.md` with the fields/sections and different lifecycles above. None has an inferred-lessons or free-form agent-judgment section. Distinguish template metadata/instructions from instance frontmatter/body so scaffolded records do not contain template-only YAML or instructions masquerading as evidence. CLI fills only identity/time/scope defaults; unknown provenance remains empty/unknown and dream review defaults to unreviewed.
- [ ] Extend `templates.ts` and CLI discovery with categories and effective user-over-bundled resolution. Preserve existing default article listing, JSON fields, custom templates, and no-overwrite seeding. No blanket changes to the article linter.
- [ ] Update `skills/dw-remember/SKILL.md` and references to describe raw-packet preparation, CREATE/UPDATE capture, exact CLI-returned paths, collection/page scope, shared-record links, completion/reindex, preserved previous evidence, and partial-failure retries. State that direct metadata filling is allowed; article frontmatter remains CLI-owned.
- [ ] Update `skills/shared/agents/dw-researcher.md` to return actual retrieved excerpts with timestamps/locators/capture limitations rather than inferred fact lists. Update `dw-author.md` to consume source packets without rewriting retained originals or adding unsupported durable claims; reviewers continue to tighten articles only. Do not introduce a new agent inference pass.
- [ ] Update `skills/dw-learn/SKILL.md`, `references/{session,history,repo,mine}.md`, and the bundled `session-transcript-template.md`. Replace the inference-oriented five-section capture with source-located user requests, role-labeled raw session outputs, commands/results, and exact source snippets. Any optional index/summary points back to raw material and cannot itself supply learning evidence. Remove prompts to infer root causes/preferences/patterns; retain explicit source statements with attribution and relevant counterevidence. Preserve ordering, session/commit/excerpt locators, scope, and existing redaction rules.
- [ ] Handle existing seeded/custom session-transcript templates explicitly: no-overwrite template seeding will leave old five-section copies in place. Detect/report that mismatch, document the template migration, and require the skill's raw evidence packet even when a legacy/custom summary template is retained. Never silently overwrite user templates or let an old template reintroduce inference-based learning.
- [ ] Update `skills/dw-dream/SKILL.md` and `references/cycle.md` for metadata intake, the dedicated learning template, source-backed improve/merge/deprecate operations, cross-page source links, separate run/action/review states, inspected record paths in reports, and partial-failure recovery. Consult existing edits/rejections/dismissals before creating/applying a learning; avoid recursive learning from assistant summaries. Keep the pass bounded and existing article draft/deprecation semantics.
- [ ] Explicitly revise dream's CLI mutation allowlist to include metadata capture/fill/reindex only. Forbid autonomous review promotion, rewriting completed captures, and learning/source removal. In dry-run mode, skip optional dw-learn capture and all article/meta mutations; write only proposals with actual excerpts and proposed records.
- [ ] Document inspecting/editing/rejecting/removing a single dream learning, reindexing afterward, dismissal behavior, preserved raw evidence, and the fact that metadata removal does not revert affected articles. Add the records' source-linked template example rather than a model-written “lessons learned” essay.
- [ ] Regenerate shared vendored skill files with `mise run skills:build`. Update `docs/agent-skills.md`, relevant architecture documentation, `wiki/api-docs/{cli,core}.md`, and skill template references with the layout, commands, backup boundary, and limits of reconstruction.
- [ ] Validation
  - [ ] CLI integration tests cover global/repo collection init, exact file targets, invalid/missing targets, categories/user overrides, scaffold-only creation, direct record completion plus reindex, JSON paths, repeated invocations, and interrupted writes.
  - [ ] End-to-end temporary-home scenario: create a draft from literal user text/code, capture collection evidence once, update the page with new instructions/external excerpts, and verify both history events and shared-source links survive unchanged.
  - [ ] Exercise dream improvement, merge, and deprecation packets: each applied change has one small inspectable learning record, primary source links, and correct affected-page hashes; both merged pages' evidence survives. Verify no-op/dry-run paths allocate no learning/meta records, change no review states, and do not call dw-learn capture.
  - [ ] Exercise the user workflow for editing/rejecting/removing a dream record, including after deregistration. Reindex must preserve edits, exclude rejected/dismissed records, leave original snippets/attachments intact, and not undo articles. Re-running dream with the same evidence/action key must not recreate a dismissed or rewritten variant; new evidence must be distinguishable.
  - [ ] Manually review source/learning fixtures against adversarial examples: an assistant's confident claim without source support, a user command mistaken for a general preference, one successful run generalized to a rule, conflicting outputs, and inferred causality. The stored packet contains attributed quotations/results or an explicit evidence gap, never an invented lesson. Validate skill/template behavior through representative packets rather than tests that only search instruction text.
  - [ ] Confirm metadata/excerpt markers never appear in browse/search/graph/static-export artifacts. Manually walk the skill instructions for CREATE, UPDATE, dw-learn, dw-dream, missing source access, and capture failure; check article drafts still lint normally.
  - [ ] Run `mise run skills:validate` after vendoring; add only meaningful core/CLI tests, not tests that merely mirror template prose.

### Phase 3: Descriptive index titles and collapsed navigation

- [ ] Add a title-only core writer and CLI `--title` option. Reject an empty title, include it in the CLI's “Nothing to update” check, preserve body bytes/other frontmatter, and do not rename/re-slugify a file. Validate combined updates as described above.
- [ ] Audit the registered roots immediately before live repair. The current read-only audit found these replacements:

  | Article path within global collections | New title |
  | --- | --- |
  | `aws/index.md` | AWS |
  | `compgeo/index.md` | Computational Geometry |
  | `cpp/index.md` | C++ |
  | `docker/index.md` | Docker |
  | `gcp/index.md` | Google Cloud |
  | `hpc/index.md` | High-Performance Computing |
  | `llm/index.md` | LLM Engineering |
  | `mle/index.md` | Machine Learning Engineering |
  | `odin/index.md` | Odin |
  | `react/index.md` | React |
  | `typescript/commander-cli/index.md` | Commander.js CLI Patterns |

- [ ] During execution, reconcile meta and record the current title-repair instruction/before state, then apply these title-only updates to the live global knowledge base. If a file's title has since become meaningful, keep it. Inspect newly found generic titles using their contents; use judgment for clear cases and ask only when genuinely ambiguous. Record resulting revision links and verify no other content changed.
- [ ] Update collection-index template/skill guidance to separate the `index.md` path from its descriptive title. Inspect the existing `browse.ts -> site.ts -> AppSidebar` title flow; keep authored titles and route identities intact rather than hiding bad data with a broad display override.
- [ ] Set `BranchNode` initial state in `apps/wiki/src/components/nav-tree.tsx` to collapsed at every depth. Keep caret toggle, label navigation/expansion, nested indentation, draft/audience markers, and git badges. No active-route auto-expansion or collapse-state persistence is needed.
- [ ] Validation
  - [ ] Core/CLI regression coverage proves title-only changes preserve custom YAML fields/comments and body bytes, preserve file paths, and work with body/status updates. Check actual collection and nested-folder titles through the existing core/UI data pipeline.
  - [ ] Update navigation fixtures/e2e steps that currently rely on automatically open collections to expand them explicitly. Verify initial collapse and manual nested navigation in the rendered app; a one-line state initialization does not need a test that just restates its implementation.
  - [ ] Compare pre/post live title-repair files and report the exact pages changed. Confirm the sidebar now shows the proposed titles and no collection opens automatically on a fresh load.
  - [ ] Run the applicable existing `mise run test:unit`, `mise run test:e2e`, `mise run lint`, `mise run format:check`, `mise run skills:validate`, and `mise run build` tasks once the implementation is complete. Record failures and their scope; fix relevant failures. No commit/push or publishing step is part of this plan.

## References

- User's sources request in this conversation: raw code and human provenance; collection/page metadata; history/external-extract templates; descriptive index titles; collapsed sidebar folders. Follow-up feedback: redo the plan with high reasoning; explicitly integrate dw-dream, add individually inspectable/editable/removable dream learnings, and prioritize raw session outputs/user requests/source snippets over LLM judgments or inferences.
- `packages/diffwiki-core/src/{paths,home,registry,collections,articles,repo,project}.ts`: home resolution, persistent mutations, external collection roots, and deliberately ephemeral project homes.
- `packages/diffwiki-core/src/{browse,site}.ts`: actual index files are excluded from article-tree leaves; index frontmatter supplies collection/folder titles.
- `packages/diffwiki-core/src/{templates,frontmatter,lint}.ts`: template discovery/seeding, raw YAML helpers, fixed-field article serialization, and article-specific lint budgets.
- `packages/diffwiki-cli/src/cli.ts`, `packages/diffwiki-cli/templates/`, and `packages/diffwiki-cli/tests/helpers.ts`: existing mutation/template commands and isolated CLI test harness.
- `skills/dw-remember/`, `skills/dw-learn/references/{session,history,repo,mine}.md`, and `skills/shared/agents/{dw-author,dw-researcher}.md`: evidence currently becomes summarized notes and a short reference list before drafting.
- `skills/dw-dream/SKILL.md` and `references/cycle.md`: dream writes articles directly; its current CLI-only draft/deprecation allowlist and optional capture-before-dry-run sequence need explicit provenance/dry-run updates.
- `packages/diffwiki-cli/templates/session-transcript-template.md`: current “Issues & learnings” and “Decisions & patterns” prompts encourage summarized/inferred material; replace capture with role-labeled source excerpts and locators.
- `apps/wiki/src/components/{app-sidebar,nav-tree}.tsx`: collection title rendering and `useState(depth === 0)` initial expansion; AppSidebar's comment already says everything starts collapsed.
- `mise-tasks/{build,test,lint,skills}/`: existing build, test, formatting, and skill-vendoring checks.
- Read-only audit of `~/.diffwiki/collections` confirmed the eleven generic titles listed in Phase 3. No source code or live wiki pages were changed during this revision.
