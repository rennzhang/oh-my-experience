---
title: Examples
status: active
---

# Examples

The easiest way to understand OME is to look at a real prompt-time recall.
This example uses a goal-start prompt because it shows the core difference
between a generic rule file and a conditional experience card.

## Example: `/goal` Starts Full-Closure Delivery

Assume your active library contains a reviewed card for goal execution. In this
example the card is named `Enter full-closure delivery mode when a goal
starts`. Its usage criteria say to use it when `/goal`, `create a goal`, or
`start now` begins a real execution task, and to ignore it for documentation
examples, feature explanations, or business-goal discussion.

When the user sends:

```text
Based on the checkout redesign plan, create a goal and start now. Finish the
whole feature end to end and verify it yourself.
```

OME decomposes the prompt into a task envelope. It detects goal execution
wording, explicit execution intent, and real validation wording. That is enough
to list the goal card as a high-risk, must-use candidate. Candidate does not
mean automatically used; the agent still checks the card's workflow meaning
against the current task before reading and applying the full rule.

## What Gets Mounted Into The Agent Prompt

The hook mounts a compact context block. The frame is English so Codex and
Claude receive one stable instruction shape. The card content stays in the
language stored on the card.

```text
OME candidate experience cards. Matched does not mean used: apply a card only when its workflow meaning fits the current task; ignore unrelated or conflicting cards.
Final report: if you actually used any card, add one final line `**OME experience cards used in this response: N** ...` using only the `Final link if used` values for cards you applied; omit the line if none applied.
1. [high risk][must] Enter full-closure delivery mode when a goal starts (agent-goal-execution)
   Summary: When a user starts real execution with /goal, create a goal, or start now, a common failure is only creating goal copy or implementing a small slice; the agent should enter full-closure delivery and ignore docs examples, feature explanations, or business-goal discussion.
   Scope: global
   Use if: /goal starts execution; create a goal and start; use goal for a long task
   Ignore if: /goal appears in docs or examples; explaining goal without executing
   Matched by: task looks like a real goal-execution start
   Rule: ome experience show agent-goal-execution --section rule
   Final link if used: [Enter full-closure delivery mode when a goal starts](<~/.oh-my-experience/experiences/active/agent-goal-execution.md>)
```

The linked path is rendered from the user's own library. A global library uses
the user's `dataDir`; a project library uses
`<project-root>/.oh-my-experience/`.

## What The Agent Reads Next

The injected context intentionally stays short. If the lesson applies, the agent
then fetches the rule body:

```bash
ome experience show agent-goal-execution --section rule
```

The rule says:

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

The result is not "always add more rules." The agent sees this as a candidate
only when the current prompt looks like goal execution. If the user is only
discussing business goals, OKRs, or asking what `/goal` means, the card is
ignored and does not appear in the final usage line.

## Try It Yourself

Use `ome match` to inspect the same path without sending a real agent prompt:

```bash
ome match "Based on the checkout redesign plan, create a goal and start now. Finish the whole feature end to end and verify it yourself." --explain
```

Use `--json` when you want to inspect the task envelope, reasons, and rendered
`additionalContext` programmatically:

```bash
ome match "Based on the checkout redesign plan, create a goal and start now. Finish the whole feature end to end and verify it yourself." --explain --json
```
