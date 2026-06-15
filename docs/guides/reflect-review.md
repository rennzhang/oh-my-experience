---
title: Reflect and Review
type: guide
priority: high
---

# Reflect and Review

OME's core value: turning the real corrections you make to your agent into
reusable experience cards.

This process is called a reflect scan. The agent inspects sessions where you
corrected it, generates candidate cards, and you decide which ones enter the
library. Active cards are then auto-injected on similar future tasks.

```text
real work → reflect scan → candidates → you review → draft → active → prompt-time recall
```

## When to run a reflect

Not every session needs one. Good times:

- You corrected the agent 2-3 times on the same type of mistake
- The agent repeated a mistake you already corrected (time to card it)
- You finished a significant phase and want to reflect
- `ome stats` shows many prompts matching no cards (your library has gaps)

## Running a reflect

### Step 1: Start the scan

Copy this to your agent:

```text
Run an OME reflect scan over my recent coding sessions:

1. Run `ome reflect start --focus "recent execution mistakes I corrected"`.
2. Check recent sessions for places where I corrected you. Look for:
   - You skipped a validation step (browser check, test run, etc.)
   - You silently swallowed an error with a fallback
   - You mixed in unrelated changes
   - You forgot a project-specific process
3. Generate candidates and write them to a file.
4. Run `ome reflect candidates RUN_ID --from-file FILE`.
5. Run `ome reflect show RUN_ID` to display all candidates.
```

### Narrowing the focus

If you already know what you want to capture:

```bash
ome reflect start --focus "browser validation and delivery gates"
ome reflect start --focus "Git commit conventions and PR process"
ome reflect start --focus "TypeScript strictness and error handling"
```

The focus is not a filter. The agent still inspects all accessible sources —
it just prioritizes the direction you specified.

### What a good candidate looks like

Each candidate must include:

| Field | Meaning | Example |
|-------|---------|---------|
| `summary` | One sentence covering failure mode, use case, ignore case, and expected action | UI changes need real browser validation; backend-only or docs-only work should ignore this card |
| `criteria.use_when` | Natural-language standards for when the model should use the card | UI changes, frontend fixes, page style adjustments |
| `criteria.ignore_when` | Natural-language near misses that should not use the card | Backend-only changes, database migrations, documentation examples |
| `recall.triggers` | Compact matcher anchors, usually 3-5 short phrases from `use_when` | browser validation, UI acceptance |
| `recall.topics` | Broad surfaces used for explainability and weighting | frontend, browser |
| `scope` | Where the card can be recalled | `{ "level": "global" }` |
| `rule` | Complete executable rule the agent reads after deciding the card applies | Launch real browser, check responsive states, interactions, loading, errors, and console |

**Good card:** one behavioral correction, precise triggers, will match accurately on future tasks.
**Bad candidate:** too vague ("value code quality"), too narrow (only applies to one file), no actionable instruction for the agent.

### Step 2: Review candidates

After the agent shows the candidates, decide one by one.

Copy this to your agent:

```text
Show me all candidates from run RUN_ID one at a time. For each, show:

- Summary
- Use criteria
- Ignore criteria
- Complete rule text

Then ask whether I want to approve, reject, merge, or rewrite.
```

For each candidate, ask three questions:
1. Will this situation happen again?
2. If the agent sees this card next time, will it avoid the same mistake?
3. Are the triggers precise enough? Will this card misfire on unrelated tasks?

### Refining the same scan

If you give the agent more context after the candidates appear, such as a link,
a pasted conversation, a correction, or "use this as reference", that should
revise the current run by default. The agent should update the same run's
candidate file and run:

```bash
ome reflect candidates RUN_ID --from-file UPDATED_FILE
```

It should not start a new reflect run or create a sibling card unless you
explicitly ask for a separate lesson. The review link should stay anchored to
the same `RUN_ID` until you approve, reject, merge, or rewrite the candidates.

### Step 3: Apply

After deciding on each candidate, have the agent apply the results:

```text
Help me apply the review decisions:

1. Run `ome reflect apply RUN_ID --dry-run` to preview the drafts that would be written.
2. Run `ome reflect apply RUN_ID` to write drafts.
3. For cards that should become active, run `ome experience enable DRAFT_ID`.
```

Applying creates drafts. Enabling makes them active. You can inspect and edit
drafts in between.

### Step 4: Verify

Verify immediately after enabling:

```text
Use `ome match` to verify the new cards.
Simulate a task similar to where the mistake happened and check whether the new cards hit.

ome match "a realistic task description" --explain
```

## Decision reference

| Action | When to use | Command |
|--------|------------|---------|
| approve | The lesson is reusable, triggers are precise | `ome reflect decide RUN_ID CANDIDATE_ID --action approve` |
| reject | Too vague, one-off, or already covered | `ome reflect decide RUN_ID CANDIDATE_ID --action reject` |
| merge | Highly similar to another candidate | `ome reflect decide RUN_ID CANDIDATE_ID --action merge --target OTHER_ID` |
| rewrite | Right direction, wrong wording | Edit the candidate file and resubmit |

## Keeping the library healthy

More cards is not better. A few long-term habits:

- **Fewer, sharper cards.** 10 cards that recall precisely beat 50 vague rules.
- **Check stats regularly.** `ome stats` shows which cards haven't matched — consider archiving them.
- **Deduplicate.** If a new card feels similar to an old one, merge them.
- **Fix over-triggering.** If a card fires on unrelated tasks, tighten `criteria.ignore_when`, `recall.triggers`, topics, or scope.

---

## One-click reflect prompt template

Use this whenever you want to run a reflect scan:

```text
Run an OME reflect scan over my recent [time period / project name] coding sessions.

Steps:
1. ome reflect start --focus "[focus area]"
2. Check sessions for places where I corrected you, generate ≤5 candidates
3. Write candidates to file, then ome reflect candidates RUN_ID --from-file FILE
4. ome reflect show RUN_ID to display candidates
5. Wait for me to approve/reject/merge/rewrite each one

Each candidate must use the current OME candidate JSON shape: audit plus summary, criteria, recall, scope, and rule. Add engine_hints only when a concrete internal signal is needed.
Only extract reusable execution judgment — don't turn one-off context into rules.
```
