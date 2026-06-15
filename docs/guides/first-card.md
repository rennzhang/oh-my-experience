---
title: First Experience Card
status: active
---

# First Experience Card

OME becomes valuable when the library contains lessons from your own real
corrections. Create those lessons through a reviewed retrospective flow, not by
writing active cards directly.

## 1. Start a retrospective

Copy this to your agent:

```text
Create an OME retrospective run for one reusable coding lesson:

1. Run `ome reflect start --focus "recent coding correction that should become reusable"`.
2. Scan the accessible coding-session sources deeply enough to find real user corrections, not just the last few messages.
3. Produce no more than 3 candidate lessons.
4. Only keep lessons that would change a future agent action.
```

`--focus` is a lens, not a shortcut. Unless you explicitly limit the source
set, the agent should still inspect all accessible session sources relevant to
the focus.

## 2. Write candidates

The agent should write candidates with:

- one clear `summary` that includes the trigger scene, failure mode, correct
  action, and boundary;
- natural-language `use_when` and `ignore_when`;
- focused `triggers` and `topics`;
- `engine_hints` only when a stable routed signal is needed;
- the complete executable rule in `rule`.

Then import them:

```bash
ome reflect candidates RUN_ID --from-file candidates.json
ome reflect show RUN_ID
```

## 3. Review before enabling

Open the generated `retrospective.md`. Ask:

- Would this situation happen again?
- Would seeing this card change the agent's next action?
- Is it specific enough to avoid broad keyword matches?
- Does it have clear ignore cases?

Record decisions:

```bash
ome reflect decide RUN_ID CANDIDATE_ID --action approve
ome reflect decide RUN_ID CANDIDATE_ID --action reject
ome reflect decide RUN_ID CANDIDATE_ID --action merge --target OTHER_ID
```

## 4. Apply and enable

```bash
ome reflect apply RUN_ID --dry-run
ome reflect apply RUN_ID
ome experience enable DRAFT_ID
```

Only active cards are recalled by hooks. Candidates and drafts stay out of the
agent prompt until you explicitly enable them.

## 5. Verify recall

Use a realistic future prompt, not the exact wording from the card:

```bash
ome match "a similar future task" --explain
```

The result should be precise. If a card matches too broadly, refine the card
before adding more cards.
