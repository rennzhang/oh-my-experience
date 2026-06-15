---
title: First Experience Card
status: active
---

# First Experience Card

OME becomes valuable when the library contains lessons from your own real
corrections. Create the first one through reflect and draft approval: the agent
reflects, you approve or refine, then you confirm what enters the library.

## 1. Start a retrospective

Copy this to your agent:

```text
Create an OME retrospective run for one reusable coding lesson:

1. Use the OME reflect flow to scan accessible coding-session sources deeply enough to find real user corrections, not just the last few messages.
2. Produce no more than 3 experience drafts.
3. Only keep lessons that would change a future agent action.
4. Give me only the draft approval page and a short summary, not JSON or internal files.
```

`--focus` is a lens, not a shortcut. Unless you explicitly limit the source
set, the agent should still inspect all accessible session sources relevant to
the focus.

## 2. Approve And Refine

Open the generated draft approval page. Ask:

- Would this situation happen again?
- Would seeing this card change the agent's next action?
- Is it specific enough to avoid broad keyword matches?
- Does it have clear ignore cases?

Reply in plain language:

```text
Approve the first one.
The second is too broad; refine it with the boundary I just gave.
Merge these two.
Do not add it yet; here is a counterexample.
```

## 3. Confirm Library Add

When it looks right, tell the agent:

```text
Add the approved experiences to the library.
```

Nothing is recalled in future tasks until you explicitly confirm adding it.

## 4. Verify Recall

Use a realistic future prompt, not the exact wording from the card:

```bash
ome match "a similar future task" --explain
```

The result should be precise. If a card matches too broadly, refine the card
before adding more cards.
