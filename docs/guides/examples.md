---
title: Examples
status: active
---

# Examples

The easiest way to understand OME is to look at a real prompt-time recall.
This example uses a goal-start prompt because it shows the core difference
between a generic rule file and a conditional experience card.

## Example: `/goal` Starts Full-Closure Delivery

Assume your active library contains an approved card for goal execution. In this
example the card is named `Enter full-closure delivery mode when a goal
starts`. Its usage criteria say to use it when `/goal`, `create a goal`, or
`start now` begins a real execution task, and to ignore it for documentation
examples, feature explanations, or business-goal discussion.

When the user sends:

```text
Based on the checkout redesign plan, create a goal and start now. Finish the
whole feature end to end and verify it yourself.
```

Before the agent starts editing, OME recognizes that this is real goal
execution, not a docs example or OKR discussion. It surfaces one approved
experience card:

```text
OME recalled:
Enter full-closure delivery mode when a goal starts
```

The agent still has to judge whether the card fits the current task. If it
does, it reads the full card and changes how it works.

## What Changes

Without OME, this kind of prompt often leads to a shallow response: create a
goal title, implement the first visible slice, run a partial check, and report
done too early.

With OME, the agent sees the actual rule before it acts:

```text
When the user says `/goal`, `create a goal`, `use goal`, `start now`,
`start executing the goal`, `run a long task`, or asks to move a set of
requirements into goal execution, treat it as an execution startup protocol,
not as ordinary goal copy. Default execution rules:

1. Before starting, clarify the goal, scope, non-scope, real completion
   criteria, and itemized acceptance checklist. If the goal is cut too small,
   call out the scope risk and include the user-confirmed requirements in the
   same goal.
2. Execute systematically from the full plan, anchored to the source of truth,
   story, roadmap, design plan, or user wording. Do not drift in direction or
   stop after the first visible slice.
3. Close every planned feature end to end. Do not ship half-finished work, happy
   paths only, UI shells, partial APIs, placeholders, fake routes, hidden test
   entries, in-memory substitutes, fake external actions, or fallbacks that
   create two versions of the truth.
4. Keep implementation maintainable, extensible, robust, and resilient. Split
   modules on real boundaries, keep responsibilities clear, and clean directly
   related dead or dirty logic when needed. Do not add abstract layers for an
   imagined future.
5. Validate through real entries and real user paths. Commands, features,
   states, docs, and evidence must cover the checklist. A successful command,
   local smoke test, or finished code change is not completion by itself.
6. For complex or high-risk goals, run a self-review after implementation. When
   needed, dispatch an external model or review flow to check direction drift,
   feature completeness, real usability, architecture quality, and
   maintainability.
7. Completion must fail closed. If any planned feature is unfinished,
   acceptance evidence is missing, validation failed, environment blockers are
   unexplained, or risks are not stated, do not mark the goal complete. Continue
   fixing it or clearly mark it blocked.
8. Final delivery should explain the user-facing change, verified evidence,
   risks or limits, and open confirmations.
```

That means the agent should clarify scope when needed, work through the whole
plan, validate through real user paths, self-review high-risk work, and avoid
claiming completion when evidence is missing.

## What The User Sees

The final response can disclose the experience card only if the agent actually
used it:

```text
Completed the checkout prototype end to end, verified the primary flow, and
listed the remaining risks.

**OME experience cards used in this response: 1** Enter full-closure delivery mode when a goal starts
```

If the user is only discussing business goals, OKRs, or asking what `/goal`
means, OME should not surface this card and the final response should not show a
usage line.
