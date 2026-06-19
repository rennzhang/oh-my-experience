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
- `criteria.ignore_when`: common near misses. Use them for documentation examples,
  explain-only prompts, business uses of overloaded words, or tasks where the
  lesson is explicitly noise.
- `recall.triggers`: the compact trigger list used by the matcher.
- `recall.topics`: broad taxonomy such as `git`, `frontend`, or `runtime`.
  Topics help recall, but should not be the only reason a precise card matches.
- `scope.level`: where the card may apply. Use `global`, `project`, or
  `project-family`.
- `scope.project_key`: the project identity used for project matching, such as
  a repository key.
- `scope.module_path`: optional path inside the project, such as `apps/web`.
- `engine_hints.positive`: internal recall hints for task shapes OME can
  detect reliably. Routing hints such as `ui_surface`, `goal_execute`, or
  `worktree_diff_operation` are strict gates as well as boosts: if the prompt
  does not contain that task shape, generic words such as "real" or
  "validation" cannot recall the card.
- `engine_hints.negative`: internal recall hints that suppress common false
  positives.

Engine hints are not the source of truth for human or model judgment. They are
heuristics. Hook context shows natural-language usage criteria and natural
match reasons, not internal hint ids.

Common signals:

| Signal | Use |
|---|---|
| `goal_execute` | User is starting an agent goal, `/goal`, or full-closure execution. |
| `goal_example_discussion` | Goal wording appears only inside docs, examples, or explanations. |
| `business_goal_discussion` | Goal means a business or life objective, not agent execution. |
| `explain_only` | User asks for an explanation only. |
| `git_operation` | Real Git, diff, stage, commit, push, or worktree operation. |
| `worktree_diff_operation` | Dirty worktree, diff, stage, or commit-scope operation. |
| `historical_session_lookup` | Spool/session UUID lookup or historical conversation evidence. |
| `provider_adapter_boundary` | Provider hook/runtime boundary work. |
| `package_install_validation` | Tarball, package, or clean install validation. |
| `ui_surface` | Real UI, browser, viewport, or frontend validation surface. |
| `ui_surface_noise` | UI wording is explicitly described as noise. |
| `delivery_gate` | Delivery, final review, pre-submit, or acceptance gate work. |
| `source_truth_chain` | Requirement, design, acceptance, and implementation source-of-truth alignment. |
| `failure_triage` | Debugging needs environment/tool/config vs business failure separation. |
| `temporary_mock_boundary` | Mock, fake data, placeholder, fallback, or temporary implementation boundary. |
| `external_model_review` | External or multi-model review with source anchors and decision boundary. |
| `rule_governance` | Agent rule, AGENTS, CLAUDE, or rule-layer governance. |
| `bridge_runtime_validation` | Bridge, bot, message service, watchdog, or runtime status validation. |
| `design_source_alignment` | UI/UX or product design work that must align with DESIGN.md or a design source. |
| `information_design` | Attention hierarchy, concept slimming, or low mental-load information design. |
| `architecture_quality` | Cohesive modules, low coupling, clean logic, or root-cause implementation work. |
| `high_risk_action` | Irreversible or high-risk operation that requires explicit authorization. |

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
