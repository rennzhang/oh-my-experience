---
title: Experience Card Schema
status: active
---

# Experience Card Schema


## Card Shape

```yaml
schema: ome-card
id: browser-validation
status: active
title: Browser Validation
category: Testing
summary: When a UI-facing change can affect visible behavior, the common mistake is to stop at static checks or internal calls; validate the real user path in a browser and ignore backend-only work.
criteria:
  use_when:
    - UI or browser validation
    - visible frontend change
  ignore_when:
    - pure backend migration
    - UI wording is only an example
engine_hints:
  positive:
    - ui_surface
  negative:
    - ui_surface_noise
recall:
  policy: must
  risk: high
  confidence: medium
  triggers:
    - browser validation
    - UI verification
  topics:
    - frontend
    - test
scope:
  level: project
  project_key: github.com/example/app
  module_path: apps/web
language: en
```

````markdown
## What This Card Is For

When a UI-facing change can affect visible behavior, the common mistake is to
stop at static checks or internal calls; validate the real user path in a browser
and ignore backend-only work.

## Usage Criteria

Use:
- UI or browser validation
- visible frontend change

Do not use:
- pure backend migration
- UI wording is only an example

Recall policy: must.
Risk: high.

## Full Rule

```text
Open the real UI, exercise the user-visible path, check the viewport, and inspect
the browser console before calling a UI-facing change complete.
```
````

## Body Sections

Active cards are Markdown cards. The frontmatter is the compact machine index;
the body is the human-readable card and the source for the full reusable rule.

The body has three stable sections:

- `What This Card Is For`: a plain-language introduction.
- `Usage Criteria`: short key-value lines for human review.
- `Full Rule`: the complete retrospective rule in a fenced text block.

`ome experience show CARD_ID --section rule` reads the full rule from the card.
Hook context does not inject the full rule; it injects only a compact candidate
index: title, id, summary, scope, usage criteria, match reason, rule command,
and final-report link. The agent fetches the full rule only if the card applies.

Write `summary` as one complete sentence with three parts: when the card applies,
the common wrong turn, and the correct action or exclusion boundary. Keep it
short enough for hook context, but complete enough for model judgment.

## Language

Card fields use the language chosen when the card is created or approved. OME
currently supports only English and Chinese for approved card content and
user-visible recall output. The fixed hook frame around card fields stays
English, but user-authored card content is not translated in the hot path. The
prompt frame keeps recall-disclosure semantics explicit without adding response
language instructions.
Direct source evidence may keep its original language in retrospective audit
records. Cross-language recall should be handled through triggers, aliases, and
preserved technical tokens, not hook-time translation.

Card language is also a recall signal. Prefer the language that matches how the
user will likely ask for the same workflow later. For Chinese source evidence
and Chinese user phrasing, a Chinese `summary`, `criteria`, and triggers often
preserve the most useful recall anchors.

`auto` and `mixed` are compatibility or internal detection states. New approved
cards should use `en` or `zh` content.

## Retrieval Fields

Retrieval fields should describe when the lesson is useful, not just what nouns
appear in the lesson.

- `criteria.use_when`: short workflow-entry phrases. Good entries are close to what a
  user would say when the lesson should apply, such as `run git status before
  commit` or `validate UI in browser`.
- `criteria.ignore_when`: common near misses. Use them for documentation
  examples, explain-only prompts, business uses of overloaded words, or tasks
  where the lesson is explicitly noise. Containing an exact normalized phrase
  is a hard exclusion; fuzzy overlap is negative evidence rather than an absolute
  match.
- `recall.triggers`: the compact trigger list used by the matcher.
- `recall.topics`: broad taxonomy such as `git`, `frontend`, or `runtime`.
  Topics help recall, but should not be the only reason a precise card matches.
- `scope.level`: where the card may apply. Use `global`, `project`, or
  `project-family`.
- `scope.project_key`: the project identity used for project matching, such as
  a repository key.
- `scope.module_path`: optional path inside the project, such as `apps/web`.
- `engine_hints.positive`: registered internal recall hints for task shapes OME
  can detect reliably. It is the required-any group: when several ids are
  listed, at least one positive signal must be present. Routing hints such as
  `ui_surface`, `goal_execute`, or
  `worktree_diff_operation` are gates as well as positive evidence: if the
  prompt does not contain that task shape, generic words such as "real" or
  "validation" cannot recall the card.
- `engine_hints.required_all`: optional strict conjunction. Every registered
  signal in this list must be present. Use it only when all listed task shapes
  are genuinely necessary; overusing it causes false negatives.
- `engine_hints.negative`: internal recall hints that suppress common false
  positives. A negative signal only suppresses the positive targets declared
  by its registry definition.

Engine hints are not the source of truth for human or model judgment. They are
heuristics. Hook context shows natural-language usage criteria and natural
match reasons, not internal hint ids.

Signal ids come from the shared registry rather than a scorer-local whitelist.
Each registry definition declares polarity, routing behavior, matching
patterns, negative targets, and ownership metadata:

- `source: generic` identifies a task shape suitable for the open-source core;
- `source: pack` and a non-empty `pack` identify a bundled domain or product
  pack.

This metadata keeps product-specific language out of the generic contract while
keeping built-in extensions organized. The registry is compiled into the
package; there is no runtime third-party signal registration API. Card files
store only the signal ids. Unknown ids should be reported by card validation
instead of being silently treated as working routing hints.

Bundled signal examples:

| Signal | Source | Pack | Use |
|---|---|---|---|
| `ui_surface` | generic | - | Real UI, browser, viewport, or frontend validation surface. |
| `ui_surface_noise` | generic | - | UI wording is explicitly described as noise; targets `ui_surface`. |
| `worktree_diff_operation` | generic | - | Dirty worktree, diff, stage, or commit-scope operation. |
| `provider_adapter_boundary` | generic | - | Provider hook/runtime boundary work. |
| `dispatch_runtime_development` | pack | `ai-dispatch` | Development of ai-dispatch provider, routing, resume, or stream runtime; ordinary dispatch use is excluded. |
| `control_plane_worker_divergence` | pack | `agent-ops` | Capacity, lease, or queue state diverges from live worker evidence. |
| `control_plane_divergence_ruled_out` | pack | `agent-ops` | An apparent capacity, lease, or worker mismatch was explicitly disproved; suppresses divergence routing. |
| `runtime_reference_context` | generic | - | Runtime wording appears only in docs, fixtures, simulations, UI copy, hypotheticals, or prohibitions; suppresses runtime-development and divergence routing. |
| `dispatch_tool_use_context` | pack | `ai-dispatch` | ai-dispatch is invoked as a tool to work on another target; suppresses runtime-development routing. |
| `external_model_review` | generic | - | External or multi-model review with source anchors and decision boundary. |
| `goal_execute` | pack | `agent-goal` | Agent goal or full-closure execution. |
| `goal_example_discussion` | pack | `agent-goal` | Goal wording only inside docs, examples, or explanations. |
| `ome_review_surface` | pack | `ome` | OME draft approval or experience-library governance. |
| `historical_session_lookup` | pack | `spool` | Historical session or conversation evidence lookup. |

The registry is the authoritative list. The examples above are illustrative,
not a second whitelist that consumers should copy.

Persisted frontmatter uses these groups:

```yaml
engine_hints:
  positive: [ui_surface, design_source_alignment] # at least one
  required_all: [explicit_execute, real_validation] # every item
  negative: [ui_surface_noise]
```

Examples:

- Do not make `git` alone a trigger for dirty-worktree safety. Use precise
  natural-language criteria and, when helpful, an engine hint such as
  `worktree_diff_operation`.
- Do not make `/goal` alone enough for a goal-execution card. Also block
  `goal_example_discussion` so docs examples do not recall the card.
- Do not make `Spool` enough for a session handoff card. Require
  `historical_session_lookup`.

## Lifecycle

Reflect candidates are not cards yet. Only `active` cards are recallable.

```text
candidate -> draft -> active -> archived
```

Field naming in Markdown frontmatter should use snake_case inside nested
objects. Runtime APIs may use camelCase internally, but reference docs should
present the persisted frontmatter form.

## Categories

`category` is first-class metadata, not a `sources` convention. Reflect
candidates should include a category when generated; if omitted, the CLI infers
one from title, topics, triggers, and lesson text. Users may override the
candidate category before applying a reflect run; new category names are stored
directly on candidates and cards.

## Provenance

Active cards keep the card surface small. Dates, raw sources, `origin`, and
`source_refs` stay in retrospective runs, operation logs, backups, and generated
indexes when needed; they are not part of the main active-card Markdown surface.

## Topics And Scope

`topics` describe what the card is about, such as `frontend`, `git`, `runtime`,
or `review`. They are used for matching and filtering.

`scope` describes where the card may be recalled:

- `global`: usable in any project.
- `project`: recall only when the current project key matches.
- `project-family`: recall when the project family matches, such as the same
  GitHub owner.

The hook uses this metadata at prompt time to keep broad cards broad and scoped
cards scoped.
