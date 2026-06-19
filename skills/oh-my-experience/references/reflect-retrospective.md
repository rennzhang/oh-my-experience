# OME Session Retrospective Guide

## When To Use

Use this reference when the user asks to:

- Run an OME retrospective.
- Extract reusable rules from historical sessions.
- Create or advance an OME retrospective run.

## Agent Responsibilities

1. Scan all accessible user-session sources.
2. Extract reusable execution lessons and user preferences.
3. Organize findings as experience drafts that stop at user approval.

Non-goals: install/setup work, hook troubleshooting, direct active-card writes,
or making the user's final approval decision.

When exact `ome` commands are needed, read `references/cli.md`. This guide
defines scanning and retrospective behavior, not the CLI manual.

## Completion Gate

Before submitting retrospective results, verify:

- [ ] `sourceCoverage` and `focusLens` are declared.
- [ ] All accessible sources were searched unless the user explicitly bounded the source set.
- [ ] system / developer / AGENTS / assistant / subagent / prompt-template noise was filtered.
- [ ] Original user messages were replayed for wording, corrections, acceptance, and rejection.
- [ ] Repeated patterns, failure causes, final working paths, and user standards were clustered.
- [ ] Similar active cards were checked through `references/similarity-check.md`.
- [ ] Remaining evidence gaps are listed.
- [ ] Retrospective judgment is produced before candidates.

If any item is missing, the retrospective is not ready and candidates must not
be submitted.

---

## Core Principles

- **Focus lens does not change source coverage**: `focusLens` changes the
  analysis lens only. It does not shrink `sourceCoverage`. A "browser
  validation" focus still scans all accessible sessions.
- **Scan broadly before extracting narrowly**: keyword search is an index entry,
  not the retrospective itself. Do not produce candidates from only the first
  few matching sessions unless the user explicitly bounded the source set.
- **Base rules override prompt preference**: the user's focus, suspicion, or
  preference is only an additional lens. It cannot bypass source coverage,
  noise filtering, original-wording checks, active-card overlap checks, or
  positive/negative validation.
- **Memory and summaries are clues only**: rollout summaries and conversation
  memory may help locate evidence, but cannot prove a candidate card by
  themselves.
- **Matched cards are not new evidence**: prompt-time OME matches during a
  retrospective are process guardrails or deduplication signals. Subject-area
  cards go only into `activeCardOverlapQa`. The final used-card disclosure may
  list only process/governance cards actually applied in the retrospective.
- **No source audit, no candidate**: `sourceCoverage: unknown` must not generate
  candidates.
- **Mark incomplete evidence honestly**: remaining gaps must be stated.
- **OME CLI writes OME data**: write candidates, drafts, and active cards through
  CLI/core paths only.
- **Lifecycle is one-way**: `candidate -> draft -> active -> archived`.
- **Keep the user mental model simple**: tell users they are reviewing
  experience drafts, can request edits, and only approved drafts enter the
  library. Do not default to exposing JSON, candidate ids, draft ids, active
  ids, run ids, or internal files.
- **Supplemental material refines the current run by default**: after drafts are
  generated but before approval, extra links, pasted content, corrections,
  counterexamples, or "absorb this too" feedback refine the same run. Do not
  create a sibling run unless the user asks for a new topic or new card.
- **Narrow scenarios stay narrow; broad scenarios may stay broad**: narrow cards
  must be anchored to real execution entrypoints, accepting missed recall over
  unrelated false positives. Broad cards are acceptable when they apply to most
  related tasks and do not make ordinary results worse. If a false positive
  makes the result worse, narrow it. If broad recall generally does not make
  results worse, it may remain broad.

---

## What To Scan

### sourceCoverage

Default: `all-accessible`.

| Value | Meaning | Trigger |
| --- | --- | --- |
| `all-accessible` | All accessible user sources | Default |
| `bounded` | User explicitly limited the source set | "Only look at the last N sessions" |
| `user-provided` | Only user-provided material | User pasted/provided files |
| `manual` | Manual audit or migration | Migrating from an old system |
| `unknown` | Incomplete audit | Must not generate candidates |

Only explicit user limits change source coverage. "Focus on X" sets
`focusLens`; it does not bound sources.

`sourceCoverage` must use the enum above. Do not invent values such as
`spool-backed`; record Spool details under `searchedSources`,
`unavailableSources`, and `remainingEvidenceGaps`.

### focusLens

The user's topic lens. Use an empty string when none is provided.

Examples:

- `focusLens: "browser validation"`
- `focusLens: ""`

`focusLens` increases audit sensitivity around failure modes, counterexamples,
user corrections, and adjacent-card conflicts. It does not replace broad source
coverage.

### Default Sources

1. Codex sessions (`.jsonl`)
2. Claude sessions (local Claude Code JSONL / transcript)
3. Execution logs
4. Task traces
5. Previously scanned session records
6. Other user-specified sources
7. Spool as an optional supplemental source when installed/enabled

### Native User-Only Evidence Layer

A qualified deep scan should first build a native Codex + Claude user-only
index:

```bash
ome source user-index build --provider all --json
```

Requirements:

- `user-index` is a temporary evidence workbench. It does not write the long-term source index and does not enter prompt-time recall.
- Missing Spool is not an evidence gap. Missing or unreadable native Codex/Claude sources are gaps.
- Run all query families through `ome source user-index search "<query>" --index <file> --json`.
- Replay high-value hits with `ome source user-index show <hit-id> --index <file> --context <n> --json`.
- For `sourceCoverage=all-accessible`, audit must include `userOnlyIndexBuilt: true`, `nativeSourcesCovered`, `queryFamilies`, and `contextReplaySamples`.
- Evidence anchors prefer original user wording. Assistant/tool context can explain causality and counterexamples, but cannot replace user evidence.

### Agent Query Expansion

Semantic expansion is the agent's job, not Spool's or the OME CLI's job. The
agent must split `focusLens` into multiple natural-language entrypoints and
search, merge, dedupe, and verify them across the selected backends.

Requirements:

- Split the topic into 3-8 search entrypoints: likely user wording, synonyms,
  opposite phrasing, acceptance standards, rejection reasons, paths/modules.
- Keep each query short. A compound phrase such as "minimal intrusion no legacy
  baggage" is one narrow entrypoint, not the whole topic.
- Use the same expansion across backends: Spool queries, local full-text
  search, source index, or user-provided files.
- Deduplicate by session/message, then filter by `messageRole=user`, time, cwd,
  and context type.
- Search counterexamples and boundaries: cases where the user accepted
  compatibility, temporary solutions, or concept-only discussion.
- Record actual query families, backends, and filtering rules in
  `searchedSources`.

### Spool Branch Strategy

Run `ome source status --json` and choose the route from real status. Spool is a
secondary optional source. It does not change candidate lifecycle, replace
native user-only indexing, or replace original-wording validation.

#### No Spool / Spool Off

- Continue with native Codex/Claude user-only index, scanned source index, and
  user-provided sources.
- Record enumerated session directories, source indexes, and representative raw records in `searchedSources`.
- Build a cleaned user-message index that removes system/developer/AGENTS/assistant summary/worker prompt/IDE injected context.
- Run multiple query families. A single keyword or one `rg` hit is not enough.
- Treat keyword counts as index signals only.
- Replay high-value evidence in raw `.jsonl` or session records to confirm role, context, correction, acceptance, or rejection.
- Write `spoolSupplement: "unavailable"` or `"skipped"` when relevant. If native sources are covered, source coverage can still be `all-accessible`.

#### Spool Enabled

- Complete the native Codex/Claude `user-index` first.
- Record `spool status`; run `spool sync` when fresh extended history is needed,
  and record before/after session counts, source distribution, and time.
- Default to search-first, not scan-first. Use multiple short
  `spool search "<query>" --json --limit <n>` queries to locate candidate
  sessions, then dedupe and decide whether to scan.
- Split queries into exact user wording and broad engineering concepts.
  Broad concepts may need local full-text or source-index coverage.
- A sparse single Spool query does not prove topic absence. Search synonyms,
  near-synonyms, opposite expressions, and boundaries.
- Scan only selected high-value hits. Do not scan large Spool history with a
  broad theme as the first step.
- If a broad query returns huge sessions, partial failures, or excessive output,
  narrow the query and record the degradation in `unavailableSources` or
  `remainingEvidenceGaps`.
- Treat current-run assistant text, OME development summaries, and assistant
  paraphrases as noise unless they can be traced to independent user wording.
- Best supplemental evidence shape: Spool session UUID / source / startedAt /
  cwd / role / snippet + selected scan result + native user-index replay.
- If only representative Spool queries were used and native user-index was not
  completed, use `sourceCoverage=bounded`. If native and user-specified sources
  are covered, Spool absence does not block `all-accessible`.

---

## How To Scan

### Step 1: Confirm The Two Axes

```text
sourceCoverage: <enum value>
focusLens: <user focus or "">
```

When the user gives a session id, do not pass it to `ome reflect start`; read it
during source audit.

### Step 2: Create A Retrospective Container

Use `ome reflect start` according to `references/cli.md`. If Spool is
unavailable, continue with Codex, Claude, or local source paths.

### Step 3: Scan Sources

Build native Codex/Claude user-index first, then search query families and
replay context. When Spool is enabled, search first and scan selected hits only.

### Step 4: Enumerate Searched Sources

List every file read and every scanned record, then write them to
`searchedSources`.

### Step 5: Filter Noise

Do not use these as direct user evidence:

| Noise | Example |
| --- | --- |
| system / developer instructions | injected config |
| AGENTS.md / repository rules | project rule dumps |
| assistant summaries | agent-generated summaries |
| subagent reports | child-agent output |
| prompt templates | fixed prompt formats |
| non-user wording inside paraphrases | third-person inference |

When paraphrased material is used, extract only identifiable original user
input and label it as extracted evidence.

### Step 6: Search Evidence And Counterexamples

- Build an index from keywords, session ids, paths, titles, and user wording.
- Expand `focusLens` into multiple short query families and search each one.
- Extend to all accessible sources rather than the first few hits.
- Search user messages that match the focus.
- Search counterexamples where similar scenarios were handled differently.
- Search near-noise: docs examples, explanation-only discussion,
  tool-name-as-source, business concepts, and non-execution contexts.
- With Spool, use exact phrases for session anchors, then local full-text or
  source index for broad concepts.
- Without Spool, build a cleaned local user-message index and replay raw
  sessions for representative evidence.

### Step 7: Validate Raw Records

For each evidence item:

- Return to the raw session file.
- Confirm whether it is user wording or a paraphrase.
- Confirm context: correction, acceptance, rejection, or casual mention.
- Label extracted wording when using paraphrased material.

### Step 8: Cluster Evidence

For each cluster, answer: how often did it repeat, what finally worked, and did
the user accept it?

### Step 9: Check Active Card Overlap

Run similarity analysis through `references/similarity-check.md` and write the
result into `activeCardOverlapQa`. Each candidate must include a
`candidateAction` (`new`, `merge`, `narrow`, `reject`, or `keep-separate`) and,
when an adjacent active card is involved, an `adjacentAction`
(`none`, `archive-adjacent`, `merge-adjacent`, `narrow-adjacent`, or
`keep-adjacent`).

The overlap check answers whether adjacent experiences already exist and
whether the new result should be added, merged, narrowed, archived, or kept
separate. Do not treat active cards as evidence for a new candidate. Do not
list a subject-area card in the final used-card disclosure only because the hook
matched it during retrospective work. Only process/governance cards that
actually changed the retrospective method count as used cards.

### Step 10: State Evidence Gaps

List conclusions that remain uncertain because evidence is missing.

---

## Iterating After Candidates

User feedback after candidates but before approval usually means "make this
draft more accurate", not "create a sibling run".

Rules:

1. Locate the most recent or named `runId`; read `ome reflect show <run-id> --json` and current candidates.
2. Decide which candidate is affected: summary, trigger, ignore boundary, rule, evidence, conflict, reject, or merge.
3. Rewrite the complete candidate set for the same run, preserving unaffected candidates and modifying affected ones.
4. Append the new source and `userCorrections` to audit; explain if this was a refinement rather than a new full scan.
5. Run `ome reflect candidates <run-id> --from-file <file>` to update the review file.
6. Tell the user this is still the same retrospective. Do not apply or enable before approval.

Forbidden:

- Do not create another sibling run just because the user gave a new link or correction.
- Do not store the user's supplemental raw text as a long rule.
- Do not treat "absorb this" as permission to enable active.

---

## How To Synthesize

### Three Questions

For each evidence cluster, answer:

1. **Execution lesson**: what failed, what fixed it, and what should be reused?
2. **User preference**: what design, product, interaction, communication, or work standard did the user repeat?
3. **Reusable rule**: what can a future agent execute directly?

### Evidence Priority

1. User wording and corrections
2. User acceptance or rejection
3. Final working path
4. Repeated patterns
5. Assistant summary, only as a locator

### Output Constraints

- Put strength, repetition, and boundaries into `recall.risk`, `recall.policy`,
  `evidence`, `criteria.ignore_when`, and `conflicts`; do not add separate
  prose sections for them.
- Candidates must derive from reusable rules, not from the latest prompt, a
  single memory, or a sparse hit.
- `rule` must be Markdown a future agent can execute directly. One-step rules
  may be one sentence; protocols, checklists, and MUST/MUST NOT constraints
  should use ordered or segmented lists.
- Protocol rules should prefer ordered lists where each item is one action,
  judgment, or gate.
- `rule` stores only the pure rule body. Do not include outer code fences in
  candidate fields. The review page should display rules inside an
  `agent-rule` fence; draft/active cards and `ome experience show --section rule`
  store the unfenced rule text.
- Produce retrospective judgment before candidates.

---

## Recall Field Writing

Candidate recall fields must help the model decide whether to use a card.

| Field | Rule |
| --- | --- |
| `summary` | One judgment-ready sentence: trigger scenario + common failure/confusion + correct action + necessary boundary. |
| `criteria.use_when` | Natural workflow entrypoints, not generic keywords. |
| `criteria.ignore_when` | Near-miss cases that should not trigger; prefer natural language. |
| `recall.triggers` | Short anchors extracted from `use_when`, usually 3-5 items. |
| `recall.topics` | Broad categories only; topics do not replace triggers. |
| `engine_hints.positive` | Use only when hints clearly reduce false positives or misses. Routing hints are strict gates. |
| `engine_hints.negative` | Use for known false-positive patterns. |
| `rule` | Future-agent executable rule text only. |

### summary

A good `summary` lets the model judge relevance from the index alone. Include:

- trigger scenario
- failure mode
- correct action
- boundary when needed

Example:

```text
When the user starts a real /goal-style execution task, the agent should enter full-closure delivery mode: clarify the goal and completion standard, implement, verify, and report; do not use this card for docs examples, feature explanations, or business-goal discussion.
```

### Common Boundaries

- `/goal` / goal creation: only real agent execution starts are
  `goal_execute`; docs examples and explanations are `goal_example_discussion`.
- Architecture quality: use for root-cause cleanup, cohesive logic,
  low-coupling refactors, and fallback removal; not for ordinary copy editing
  or concept-only discussion.
- `git`: only real commit, push, diff, stage, or worktree operations are
  `git_operation`; GitHub as a source is not a Git operation.
- `Spool`: only historical session lookup is `historical_session_lookup`;
  mentioning Spool as an optional source is not enough.
- UI/browser: real pages, browser validation, viewport checks, and frontend
  acceptance are `ui_surface`; explicit UI-as-noise uses `ui_surface_noise`.

### Field Self-Check

- [ ] Triggers read like task entrypoints, not card keywords.
- [ ] `summary` is one judgment sentence with scenario, failure, action, and boundary.
- [ ] At least one understandable near-miss is in `ignore_when`.
- [ ] Broad-word, must-use, and high-risk cards have natural-language criteria; hints are added only when useful.
- [ ] User-corrected misunderstandings are in `ignore_when`, with negative hints when stable.
- [ ] `summary` and `rule` explain applicability and boundaries in plain language.

---

## Source Audit Fields

Fill these before writing candidates:

| Field | Meaning |
| --- | --- |
| `focusLens` | Topic lens, or `""` |
| `sourceCoverage` | Source coverage enum |
| `searchedSources` | Sources actually searched |
| `unavailableSources` | Unavailable sources |
| `noiseFilters` | Noise filtered out |
| `evidenceClusters` | Evidence cluster summaries |
| `userCorrections` | User corrections |
| `rejectedInterpretations` | Interpretations the evidence rejected |
| `activeCardOverlapQa` | Active-card similarity analysis and action labels from `references/similarity-check.md` |
| `remainingEvidenceGaps` | Remaining evidence gaps |

Legacy `scope` is compatibility only. It does not define topic or source range.

---

## Language Rules

Follow `references/language-policy.md`.

- OME framework text, injected instructions, and field labels stay English.
- User-facing reminder and final used-card disclosure prose rely on the agent's
  normal response-language behavior, while keeping the same disclosure
  semantics.
- Candidate/card content must be English or Chinese. Default to the dominant
  user/source wording language so future recall matches how the user will ask
  again.
- Commands, identifiers, API names, product names, file paths, and code symbols keep their original spelling.
- Direct user quotes and source evidence may keep their original language.

---

## Internal Candidate Cards

Retrospective conclusions use a lightweight candidate format.

### Pre-Write Self-Check

- [ ] Source audit fields are filled.
- [ ] `sourceCoverage` is not `unknown`.
- [ ] Each candidate derives from a reusable rule.
- [ ] Multi-step or protocol `rule` is structured, not one long paragraph.
- [ ] Active-card similarity check is complete and labeled.
- [ ] Candidate status is `review`, not `active`.

### Field Mapping

| Field | Content |
| --- | --- |
| `summary` | One judgment sentence |
| `evidence` | Source audit + clusters + corrections + active-card check + limitations |
| `criteria.use_when` | Natural-language use criteria |
| `criteria.ignore_when` | Non-trigger boundaries |
| `recall.triggers` | Short anchors extracted from use criteria |
| `engine_hints` | Only when they reduce false positives or misses |
| `scope` | Applicability; project scope includes `level`, `project_key`, `module_path` |
| `conflicts` | Adjacent cards, rejected interpretations, tradeoffs |

---

## Experience Draft Approval

`experience-review.md` is the user-facing approval page. The user-facing name is
"experience draft approval". Each draft shows four sections only:

- experience summary
- trigger timing
- reusable rule
- approval decision

The reusable-rule section must introduce the rule and display the `rule` body in
an `agent-rule` fenced code block. Do not write the fence into candidate fields;
draft/active cards and prompt-time recall use plain rule text.

Source audit, tone strength, applicability analysis, and evidence detail stay in
candidate fields. Do not add visible sections by default.

## Post-Activation Recall Acceptance

After user confirmation, completion is not merely "an active file exists". The
card must recall from realistic future task wording.

Requirements:

1. Use the normal lifecycle: `ome reflect decide` -> `ome reflect apply --dry-run` -> `ome reflect apply` -> `ome experience enable`.
2. After enable, run `ome match "<real task entrypoint>" --json` with at least one natural phrasing; use 2-3 phrasings for complex or high-risk cards.
3. Phrasing should come from `criteria.use_when`, user wording, or likely future tasks, not a mechanical copy of the title.
4. If `matches` is empty or wrong, inspect `criteria.use_when`, `criteria.ignore_when`, `recall.triggers`, `engine_hints`, `requiredSignals`, and `blockedSignals`, then decide whether to rewrite, archive the wrong active version, or adjust matcher behavior.
5. `engine_hints.positive` / `requiredSignals` are strict routing gates. If added, verify that matcher `ruleSignals` are produced by real wording; otherwise remove the gate and keep natural-language triggers and negative boundaries.
6. The card is done only when it is `active`, `ome experience show <id> --section rule` is readable, real `ome match` recalls it, and wrong old versions are not still active.

## Delivery Output

Retrospective delivery should give the user a clickable Markdown link to the
experience draft approval page.

- CLI human output links should be relative to the current command cwd; do not
  use paths relative to OME `dataDir` as if they were clickable.
- The default user entrypoint is only the approval page:
  `Experience draft approval: [open](<relative-path-from-current-cwd>)`.
- Do not show or require users to read `candidates.json`, `audit.json`, or
  `candidates-input.json` unless they ask for debugging or schema inspection.
- Do not present `runId` as the main result. If needed, call it a retrospective id.
- Default next step: ask whether the draft should be approved, revised,
  supplemented, or added to the library.
- If a relative link may not resolve in chat, also provide a real file link.

Example:

```markdown
Experience draft approval: [open](../../../../ren-vault/AI/OME/retrospectives/2026-06-13T04-39-32-344Z-manual/experience-review.md)
Retrospective id: 2026-06-13T04-39-32-344Z-manual
```

---

## CLI Reference

All commands, flags, JSON output, candidate writes, draft approval lifecycle,
doctor, hook, skill, eval, and uninstall behavior are in `references/cli.md`.
