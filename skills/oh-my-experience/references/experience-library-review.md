# OME Experience Library Review

## When To Use

Use this reference when the user asks to:

- Review the current OME experience library.
- Run a full evaluation, governance pass, cleanup, or refinement pass.
- Review one specific card.
- Merge, delete, archive, rewrite, narrow, or strengthen existing cards.
- Check recall pollution, duplicate cards, conflicting cards, over-narrow cards,
  over-broad cards, or card rot.
- Keep the library healthy, low-noise, and split by independent scenarios.

Do not use this reference to extract new experience from historical sessions.
Session scanning and new candidate generation go through
`references/reflect-retrospective.md`.

This reference and `reflect-retrospective.md` share one card quality standard:
`summary`, criteria, exclusion boundaries, recall anchors, engine hints,
similarity analysis, and `rule` must all serve accurate recall, low context
noise, and executable guidance.

The split is:

- `reflect-retrospective.md` extracts new candidates from historical sessions.
- This reference cleans, merges, archives, and repairs existing experience cards.

When you need exact `ome` commands, read `references/cli.md`. This reference
defines governance workflow, not the full CLI manual.

## Agent Responsibilities

1. Treat the current OME `dataDir` and CLI output as the source of truth.
2. Evaluate whether existing cards remain independent, accurate, recallable, and low-noise.
3. Identify duplicates, conflicts, over-broad cards, over-narrow cards, stale cards, weak evidence, and recall pollution.
4. Give governance recommendations and evidence before changing the library.
5. Keep the lifecycle clean when changing the library: archive when possible; when rewriting, create a replacement first and then archive the old card.

Non-goals: manually editing active card files; turning a full review into a
large batch of unreviewed writes; deleting still-useful independent cards only
to reduce count; treating old session summaries as current active-library facts.

## Principles

- **Current active library first**: judge pollution and conflict with
  `ome experience list --status active --json` and `ome match`, not historical
  stats or archived files alone.
- **Full review starts with overview**: when the user asks for a full review,
  produce an overview and priority queue first. Do not batch-edit unless the
  user explicitly authorizes it.
- **Single-card review must close the loop**: read the full card, simulate
  positive and negative recall, inspect adjacent cards, then recommend keep,
  rewrite, merge, or archive.
- **Precision beats volume**: cards need clear scenarios. Triggers, negative
  triggers, category, applicability, and rule text should reduce noisy context.
- **Width depends on consequence**: use `references/similarity-check.md` when
  deciding `narrow` versus `keep-separate`. Narrow when false positives make
  results worse; broad cards may stay broad when broad recall is not harmful.
- **Create replacements before retiring old cards**: do not directly edit active
  files. New wording goes through `candidate -> draft -> active`, then the old
  card is archived after recall validation.
- **Keep history, not noise**: archived cards and retrospective runs may retain
  audit history. The active library should contain only current, clear,
  non-polluting cards.
- **Schema is the truth**: migrate or archive stale formats instead of keeping
  compatibility branches in governance logic.
- **Archived cards should remain readable by the system**: they do not enter
  recall, but they should not keep creating doctor noise. Legacy archived cards
  may be migrated to the current archived schema while preserving backups.

## Mode A: Full Review

Trigger: the user asks for a system review, full review, cleanup, rot check, or
which cards should be optimized or removed.

Steps:

1. Read current config and health:
   - `ome config get --json`
   - `ome doctor --json`
   - `ome experience list --status active --json`
   - `ome stats --json` when useful
2. Build an active-library map:
   - Group by category, topics, recall policy, and risk.
   - Mark each card's primary scenario, triggers, negative triggers, scope, and adjacent cards.
3. Use `references/similarity-check.md` to inspect library-level similarity:
   - Synonymous duplicates: two cards cover the same decision or execution gate.
   - Light overlap: cards should be chained, but their triggers may co-match.
   - Over-broad: triggers are too generic and pollute ordinary tasks.
   - Over-narrow: a one-off incident is no longer worth prompt-time recall.
   - Stale: rules point to old commands, old dataDir paths, old names, or old flows.
   - Missing negative triggers: overloaded words such as goal, review, release, source, truth, or Spool lack exclusion boundaries.
   - Weak evidence: summary or rule reads like a slogan without source or acceptance evidence.
   - Wrong category: category misleads the user or agent about the card's layer.
4. Produce an overview without editing:
   - Active count and category distribution.
   - P0: obvious pollution, wrong behavior, conflicts, or archive candidates.
   - P1: rewrite, merge, narrow, or missing negative-boundary work.
   - P2: readability, title, category, evidence fields, and archived-schema cleanup.
   - Recommended order for single-card or cluster review.
5. Guide the user into single-card review:
   - Prefer one card or one tight cluster at a time.
   - If the user says "do all", still process in clusters and validate recall after each batch.

The output of a full review is a governance roadmap, not a bulk edit.

## Mode B: Single-Card Review

Trigger: the user names a card, id, title fragment, or asks to review, rewrite,
delete, merge, or inspect one card.

Steps:

1. Locate the card:
   - Read the full card with `ome experience show <id> --json`.
   - If only a title fragment is given, use `ome experience list --status active --json` to locate one unique id.
2. Inspect adjacent cards:
   - Build 2-4 `ome match ... --json` queries from the card title, triggers, and topics.
   - Check whether other cards often co-match.
   - Read potentially overlapping active cards; do not rely on titles only.
   - Use `references/similarity-check.md` to decide whether adjacent cards should merge, narrow, archive, or stay separate.
3. Check positive and negative recall:
   - Positive examples: real user phrasing that should recall this card.
   - Negative examples: similar but ordinary tasks, concept-only discussion, or other cards' primary scenarios.
   - Use Spool or user wording only when historical evidence is needed; do not deep-scan the entire library by default.
4. Recommend an action:
   - `keep`: the rule is clear and recall is accurate.
   - `rewrite`: the scenario is valuable, but title, triggers, negative triggers, category, or rule need improvement.
   - `merge`: two or more cards express the same scenario; create one replacement and archive old cards.
   - `archive`: the scenario is too narrow, covered by another card, stale, weakly evidenced, or continuously pollutes recall.
5. Before writing:
   - Explain user impact.
   - Provide evidence entrypoints.
   - State whether the recommendation is keep, rewrite, merge, or archive.
   - Stop at recommendation unless the user has authorized changes.

## Library Mutation Rules

### Archive Only

When a card should no longer be active and does not need a replacement:

```bash
ome experience archive <card-id> --reason "<reason>" --json
```

After archiving, verify:

- `ome experience show <card-id> --json` reports `status: archived`.
- The old trigger scenario no longer recalls the archived card.
- If the scenario still has value, it recalls the replacement card or you state that no recall is needed.

### Rewrite Or Merge

When the scenario should stay but the active rule must change:

1. Create a governance run with `ome reflect start --focus "<library review focus>" --json`.
2. Write a replacement candidate. The audit must include:
   - reviewed old card id
   - adjacent-card and conflict check
   - positive and negative recall tests
   - user correction or Spool evidence, if used
   - why the action is rewrite, merge, or archive
3. Write candidates with `ome reflect candidates <run-id> --from-file <file> --json`.
4. If the user authorized the change:
   - `ome reflect decide <run-id> <candidate-id> --action approve --json`
   - `ome reflect apply <run-id> --json`
   - `ome experience enable <draft-id> --json`
5. Verify the new card hits positives and avoids negatives.
6. Archive replaced old cards.
7. Update any manual index or Obsidian index entry. Do not hand-edit active card bodies.

### Forbidden Actions

- Do not directly edit `experiences/active/*.md` to change active cards.
- Do not change only the title while leaving trigger boundaries wrong.
- Do not delete useful independent active cards only to make the library look tidy.
- Do not merge different scenarios into one broad background-noise card.
- Do not judge card value from `ome stats` alone; stats are evidence, not the decision.

## Quality Standard

Each active card should satisfy:

- **Independent scenario**: one sentence can explain when this card should appear instead of adjacent cards.
- **Judgment-ready summary**: `summary` is one sentence containing trigger scenario, common failure or confusion, correct action, and necessary exclusion boundary. It is not a title restatement, slogan, or source-audit summary.
- **Natural use criteria**: `criteria.use_when` names real execution entrypoints, not keyword piles.
- **Clear exclusion criteria**: `criteria.ignore_when` names similar but irrelevant cases, especially docs examples, explain-only tasks, tool-name-as-source cases, business concepts, and cases the user explicitly marked as noise.
- **Accurate triggers**: `recall.triggers` are short anchors extracted from use criteria; they are not long sentences, abstract adjectives, or rule excerpts.
- **Executable rule**: the rule gives future agents actions, decisions, or prohibitions; it is not a slogan.
- **Correct category**: category describes the card's work layer, not merely a keyword domain.
- **Traceable evidence**: retrospective, operation log, or review evidence explains why the card exists. The active card itself should not carry long provenance.
- **No recall pollution**: common positives should hit; common negatives should not. Co-matched adjacent cards should have clear roles.
- **Clean lifecycle**: old synonymous cards are archived; the active library has no parallel old versions.

## Governance Priority

### P0: Handle First

- An active card recalls on clearly unrelated tasks.
- An active card misses high-risk or high-frequency positives.
- Multiple active versions cover the same scenario.
- Card schema cannot be read by the CLI and breaks doctor/list.
- The rule is missing, truncated, or no longer contains the core lesson.

### P1: Handle In This Pass

- `summary` does not help the model judge usage boundaries.
- `criteria.use_when` / `criteria.ignore_when` are keyword-style, too broad, or hard to read.
- `recall.triggers` generalize into ordinary-task pollution.
- `engine_hints` lack known negative signals, or natural-language boundaries are overfit into program fields.
- Project-scoped cards lack `scope.level`, `project_key`, or `module_path`, causing global over-recall.

### P2: Schedule Later

- Title, category, or topics are unclear, but recall behavior is correct.
- Old archived card format does not affect active recall but creates governance noise.
- Provenance readability is weak, but the core rule and boundaries are correct.

## Field Cleanup Rules

### summary

Rewrite as one sentence, no longer than needed, containing:

- trigger scenario
- failure mode
- correct action
- boundary

Bad:

```text
Complete delivery when creating goals.
```

Good:

```text
When the user starts a real /goal-style execution task, the agent should enter full-closure delivery mode: clarify the goal and completion standard, implement, verify, and report; do not use this card for docs examples, feature explanations, or business-goal discussion.
```

### use_when / ignore_when

- Use short natural-language phrases, not semicolon keyword lists.
- `use_when` describes the real execution entrypoint.
- `ignore_when` describes near-miss noise and false-positive boundaries.
- User-corrected misunderstandings must enter `ignore_when`; add `engine_hints.negative` only when the matcher can detect the signal reliably.

### recall.triggers

- Extract the shortest natural anchors from `use_when`.
- Prefer 3-5 triggers. High-risk cards may use more, but they must remain specific.
- Do not use broad words alone, such as `goal`, `git`, `review`, `source`, or `Spool`.

### engine_hints

- Use only for stable program-detectable positive or negative signals.
- Positive hints confirm task intent, such as `goal_execute`, `worktree_diff_operation`, `historical_session_lookup`, or `architecture_quality`. Routing positive hints are strict gates.
- Negative hints suppress known near-misses, such as `goal_example_discussion`, `business_goal_discussion`, `git_source_noise`, or `ui_surface_noise`.
- Do not translate all natural-language judgment into hints. The model still needs to read `summary` and `criteria`.

### rule

- Store only the complete future-agent rule.
- Preserve the core lesson during cleanup.
- Do not include source audit, historical explanation, approval comments, or outer code fences.

## Full Review Output Template

```text
Conclusion:
<overall active-library health and biggest risk>

User impact:
<which cards create noisy context, missed recall, over-recall, or maintenance cost>

Overview:
- Active count, category distribution, obvious clusters
- P0 / P1 / P2 governance queue
- Recommended first card or cluster

Evidence entrypoints:
- OME commands used
- Spool searches or session UUIDs, if used
- Key positive/negative match examples

Recommended next step:
<which card or cluster to review first; whether user authorization is needed>
```

## Single-Card Review Output Template

```text
Conclusion:
keep / rewrite / merge / archive.

User impact:
<what improves if changed; what pollution or missed recall remains if unchanged>

Evidence:
- Current card id and core rule
- Adjacent cards
- Positive match
- Negative match
- Spool / user wording evidence, if used

Recommended change:
<title, summary, criteria, recall, engine_hints, scope, category, rule, or archive reason>

Execute?
<stop at recommendation unless authorized; if authorized, mutate through lifecycle and verify>
```

## Completion Standard

Before completing a library review:

- [ ] Current `dataDir` is confirmed.
- [ ] Full review versus single-card review is clear.
- [ ] Full review produced an overview and governance queue first.
- [ ] Single-card review read the full card and adjacent cards.
- [ ] Positive and negative recall were tested, or the reason they could not be tested is stated.
- [ ] The recommendation is keep, rewrite, merge, or archive.
- [ ] No active card was edited directly.
- [ ] `ome doctor --json` was validated when the library changed.
- [ ] New and old recall behavior was validated when the library changed.
- [ ] Remaining risk and user confirmations are stated.
