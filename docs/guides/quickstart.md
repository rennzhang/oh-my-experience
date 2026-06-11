---
title: Quickstart
status: active
---

# Quickstart

This guide takes you from zero to first recall. Most steps are done by your AI
agent — you copy and paste prompts.

## 1. Install (you do this)

```bash
npm install -g oh-my-experience
```

## 2. Initialize (your agent does this)

Copy this to your agent (Codex or Claude):

> Help me set up Oh My Experience:
>
> 1. Run `ome init`, accept the default path
> 2. Run `ome doctor` to verify everything is working
> 3. Run `ome hook status --provider codex` to confirm the hook is installed
>
> Report the results from each step.

After initialization, your library has a few built-in starter cards so you can
experience recall immediately. Remove them later with `ome starter remove --yes`
or archive them through the normal flow.

## 3. Experience recall (your agent simulates this)

Copy this to your agent:

> Test recall with ome match:
>
> ```
> ome match "fix login page UI and validate in browser" --explain
> ```
>
> Tell me which cards matched, why they scored, and what additional context
> would be injected.

`--explain` shows detected task signals, per-card scoring reasons, similar
cards, and the final rendered context block. If the matches don't feel right,
that tells you which cards need tighter trigger conditions.

## 4. Run your first reflect scan

Now have the agent scan your recent coding sessions for lessons. Copy this:

> Run an OME reflect scan over my recent coding sessions:
>
> 1. Run `ome reflect start --focus "recent error patterns I corrected"`
> 2. Check recent sessions for places where I corrected you
> 3. Generate candidate experience cards. Each must include:
>    - Problem: what went wrong
>    - Anti-pattern: what not to do
>    - Correct approach: what to do instead
>    - Triggers: what tasks should recall this
> 4. Write candidates to a file, then run `ome reflect candidates RUN_ID --from-file FILE`
> 5. Run `ome reflect show RUN_ID` to display all candidates
>
> No more than 5 candidates. Only extract reusable execution judgment —
> don't turn one-off context into rules.

The agent shows the candidates. You review them.

## 5. Review candidates

For each candidate, ask: will this situation happen again? If the agent sees
this card next time, will it avoid the same mistake?

If a candidate is useful:

> Help me apply these candidates. Run `ome reflect apply RUN_ID --dry-run` to
> preview first, then `ome reflect apply RUN_ID`, then
> `ome experience promote DRAFT_ID` for each card that should be active.

If a candidate is too vague, not general enough, or already covered, reject it:

```bash
ome reflect decide RUN_ID CANDIDATE_ID --action reject
```

If two candidates are similar, merge them:

```bash
ome reflect decide RUN_ID CANDIDATE_ID --action merge --target OTHER_ID
```

Only active cards are recalled by hooks. Unapproved candidates never appear
in your agent's prompts.

## 6. Verify the new card works

After approval, verify with a realistic task:

> Use ome match to verify the newly promoted cards. Simulate a task similar to
> the scenario where the mistake happened, and check whether the new card
> matches.

```bash
ome match "a task description" --explain
```

## 7. Iterate

From now on, relevant cards are injected at prompt time automatically. Check
the health of your library:

> Run ome stats. Show me the recall coverage rate, which cards haven't matched
> recently, and whether any cards are stale.

If recall is noisy, improve cards instead of disabling the system:

- Tighten triggers with workflow-specific terms
- Add negative triggers for ambiguous keywords
- Narrow project applicability
- Merge near-duplicate cards
- Archive cards that haven't matched in a long time

---

## Quick reference

Common commands when asking your agent for help:

| I want to... | Tell your agent |
|-------------|-----------------|
| Test recall | `ome match "task description" --explain` |
| Check health | `ome doctor` |
| View stats | `ome stats` |
| Start a scan | `ome reflect start --focus "focus area"` |
| Show candidates | `ome reflect show RUN_ID` |
| Preview apply | `ome reflect apply RUN_ID --dry-run` |
| Apply | `ome reflect apply RUN_ID` |
| Promote card | `ome experience promote DRAFT_ID` |
| Archive card | `ome experience archive CARD_ID` |