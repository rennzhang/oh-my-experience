---
title: Reflect and Draft Approval
type: guide
priority: high
---

# Reflect and Draft Approval

OME's core value: turning the real corrections you make to your agent into
reusable experience.

This process is called a reflect scan. As a user, you only need to ask for a
reflect, approve or refine the experience drafts, and confirm what should enter
the library. JSON files, ids, drafts, and enable commands are the agent's job.

```text
real work → agent reflects → draft approval → refine with feedback → confirm library add → future recall
```

## When to run a reflect

Not every session needs one. Good times:

- You corrected the agent 2-3 times on the same type of mistake
- The agent repeated a mistake you already corrected (time to card it)
- You finished a significant phase and want to reflect
- `ome stats` shows many prompts matching no cards (your library has gaps)

## Running a reflect

### Step 1: Start the reflect

Copy this to your agent:

```text
Run an OME experience reflect focused on recent execution mistakes I corrected.

Requirements:
1. Complete the OME reflect flow and source audit yourself. Do not ask me to read JSON or internal files.
2. Extract only reusable lessons, at most 5 at a time.
3. Give me the draft approval page link and a short summary when ready.
4. If I add thoughts, examples, or corrections, refine the same reflect instead of starting a new one.
5. Wait until I explicitly confirm adding the approved experiences to the library.
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

### What Draft Approval Should Show

Each extracted experience should help you judge four things:

- What the lesson says.
- When it should apply.
- Which near misses should not apply.
- What concrete rule the agent will follow later.

A good experience is a specific behavior correction. Vague principles, one-file
details, or summaries without an actionable future rule should not enter the
library.

### Step 2: Approve And Refine

After the agent shows the draft approval page, you can reply in plain language:

- "Approve the first one."
- "The second is too broad; make it more executable."
- "Merge these two."
- "Do not add this yet; here is a counterexample."
- "Refine the same reflect with this feedback."

For each candidate, ask three questions:
1. Will this situation happen again?
2. If the agent sees this card next time, will it avoid the same mistake?
3. Are the triggers precise enough? Will this card misfire on unrelated tasks?

### Refining the same scan

If you give the agent more context after the experiences appear, such as a
link, a pasted conversation, a correction, or "use this as reference", that
should refine the current reflect by default. It should not start a new reflect
or create a sibling lesson unless you explicitly ask for one.

### Step 3: Apply

After approving and refining, tell the agent:

```text
Add the approved experiences from this reflect to the library.
```

The agent should prepare and enable only the approved experiences. Nothing is
recalled in future tasks until you explicitly confirm adding it.

### Step 4: Verify

Verify immediately after enabling:

```text
Verify recall for the new cards.
Simulate a task similar to where the mistake happened and tell me whether the new cards hit too broadly, too narrowly, or correctly.
```

## Common Replies

| What you want | Say this |
|--------|----------|
| Add this experience | `Approve the first one.` |
| Skip it | `Reject the second one; it is too broad.` |
| Combine two lessons | `Merge the first and third.` |
| Refine wording or boundary | `Revise the second with this boundary: ...` |
| Add more evidence first | `Do not add it yet; here is a counterexample.` |

## Keeping the library healthy

More cards is not better. A few long-term habits:

- **Fewer, sharper cards.** 10 cards that recall precisely beat 50 vague rules.
- **Check stats regularly.** `ome stats` shows which cards haven't matched — consider archiving them.
- **Deduplicate.** If a new experience feels similar to an old one, merge before adding it.
- **Fix over-triggering.** If a card fires on unrelated tasks, tighten `criteria.ignore_when`, `recall.triggers`, topics, or scope.

---

## One-click reflect prompt template

Use this whenever you want to run a reflect scan:

```text
Run an OME reflect scan over my recent [time period / project name] coding sessions.

Requirements:
1. Complete the OME reflect flow, source audit, and internal candidate write yourself.
2. Inspect places where I corrected you and extract ≤5 experience drafts.
3. Give me only the draft approval page link and a short summary. Do not ask me to read JSON, internal files, or candidate schemas.
4. If I add thoughts, counterexamples, or edits, refine the same reflect instead of starting a new one.
5. Wait until I explicitly confirm adding the approved experiences to the library.

Only extract reusable execution judgment. Do not turn one-off context into rules.
```
