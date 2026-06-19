# Changelog

All notable user-visible changes to Oh My Experience are tracked here.

This project uses concise release notes focused on behavior, packaging, docs, and
compatibility. Internal refactors are listed only when they affect users,
contributors, or release safety.

## 0.2.4 - 2026-06-19

### Changed

- Simplified prompt-time recall guidance into a compact Markdown frame that
  treats matched cards as optional reminders, gives agents explicit choice over
  whole-card, partial, or ignored matches, and keeps the pre-action reminder
  focused on what OME surfaced.
- Removed response-language instructions from the hook frame so disclosure
  semantics stay explicit without restating the agent's normal language behavior.
- Moved retrospective/source-scan overlap guidance out of the generic hook
  frame and kept it in the source-scan and retrospective guidance surfaces.

## 0.2.3 - 2026-06-18

### Added

- Added lightweight OME skill references for language policy and active-card
  similarity checks, covering pre-ingest deduplication and library governance.

### Changed

- Clarified prompt-time recall guidance so agents may use all matched cards,
  select only fitting cards or card parts, or ignore all matches when none fit.
- Documented OME language layers: fixed framework instructions stay English,
  approved card content targets English or Chinese, source evidence may keep its
  original language, and user-visible OME recall prose follows English or
  Chinese response language.
- Required retrospectives to record similarity-check recommendations before
  presenting candidate cards.

### Fixed

- Corrected Chinese schema docs to mark Chinese card examples as `language: zh`.
- Added release coverage for Chinese card content inside the English hook frame
  and replaced obsolete mounted-card wording checks with real legacy templates.

## 0.2.2 - 2026-06-16

### Changed

- Treat clean-refactor and implementation-chain cleanup wording as architecture
  quality signals so architecture-gated cards can be recalled by natural user
  prompts such as "the cleanest effective change".
- Documented the post-enable recall smoke gate for agents and maintainers in
  the skill reference and English/Chinese CLI docs.

### Fixed

- Included the retrospective run id and draft approval link in human
  `ome reflect decide` output, avoiding ambiguous blank review output.

## 0.2.1 - 2026-06-16

### Changed

- Clarified hook guidance for OME retrospective and source-scan tasks: matched
  subject-area cards are active-card overlap signals, not source evidence or
  final used-card disclosures.
- Documented the same retrospective recall boundary in English and Chinese
  source-scan, retrieval API, retrieval architecture, skill, and LLM-facing docs.
- Softened README and LLM intro wording so prompt-time recall is described as
  conditional on a relevant approved lesson.

## 0.2.0 - 2026-06-16

### Added

- Added native Codex/Claude `ome source user-index build/search/show` commands
  for temporary user-only evidence indexing and original context replay.
- Added retrospective audit fields for user-only index coverage, native source
  coverage, query families, context replay samples, and Spool supplement status.

### Changed

- Made qualified retrospective guidance start from native Codex/Claude user-only
  evidence, with Spool kept as an optional supplemental source.
- Updated English, Chinese, skill, and LLM-facing docs to explain that agents own
  semantic query expansion, counterexample search, and final synthesis.

### Fixed

- Hardened user-index privacy and correctness around private temp files,
  unsupported provider errors, stale source context, and explicit Spool audit
  values.

## 0.1.5 - 2026-06-16

### Changed

- Reduced the built-in starter library to three broadly useful lessons: goal
  execution, real-entry validation, and root-cause/KISS implementation.
- Replaced the first-run demo with a visible `/tmp/ome-todo-demo` Todo app task
  that exercises automatic recall, browser validation, and the retrospective
  lifecycle.
- Added a hook-context instruction for agents to state the applicable OME
  reminder in one short sentence before acting.
- Clarified the internal release path: npm publishing uses GitHub Trusted
  Publishing from release tags, while Cloudflare Pages deploys docs from `main`.

### Fixed

- Removed old checkout, FizzBuzz, and word-count first-run examples from README,
  docs, and tests.
- Prevented future local `npm publish` confusion by adding a maintainer release
  runbook and updating release script guidance.

## 0.1.4 - 2026-06-15

### Added

- Added a first-run goal-execution starter card so new libraries can demonstrate
  prompt-time recall before users create their own cards.
- Added Codex and Claude skill installation alongside prompt-time hooks.

### Changed

- Reworked README and docs around a real agent-task demo instead of asking users
  to run recall debugging commands as the first proof.
- Simplified human CLI output to fixed English while keeping localized public
  docs under locale routes.
- Made Spool an explicit optional setup source that OME does not install during
  first setup.

### Fixed

- Reduced false positive recall for goal-related documentation, explanation,
  OKR, and business-goal prompts.
- Corrected `--no-hook` next-step output so it no longer claims automatic recall
  is connected when no hook was installed.
- Aligned example docs with the real built-in starter card ID and full card
  rule.

## 0.1.3 - 2026-06-15

### Fixed

- Updated the CLI help tagline to match the draft approval terminology used in
  the release docs and onboarding flow.

## 0.1.2 - 2026-06-15

### Changed

- Reworked the reflect flow language around experience drafts, draft approval,
  and explicit library confirmation.
- Updated English and Chinese docs, skill references, and LLM docs to match the
  simplified reflect lifecycle.
- Refined OME starter lesson wording from review-surface language to draft
  approval language.

### Fixed

- Changed human CLI output for draft approval pages to use Markdown-safe links
  so paths with spaces or special characters stay clickable.

## 0.1.1 - 2026-06-15

### Changed

- Renamed source acquisition docs and navigation from import wording to source
  scan wording.
- Documented Spool oversized-session handling and the explicit
  `--max-session-bytes` safety knob.

### Fixed

- Fixed deleted source-scan guide links in the English and Chinese docs
  sidebars.
- Removed stale import wording from source scanning diagnostics and dataDir
  migration errors.

## 0.1.0 - 2026-06-15

### Added

- Initial local-first experience library for reviewed AI coding-agent lessons.
- Prompt-time recall for Codex and Claude hooks.
- CLI flows for initialization, matching, source scanning, reflect review, card governance, doctor checks, stats, and recall evaluation.
- Built-in starter lessons for first-run validation.
- English and Simplified Chinese documentation.
- Contributor and security guidance for public collaboration.

### Changed

- Moved README brand assets under `docs/public/brand/` so the repository root stays focused on source, docs, tests, and release files.

### Removed

- Removed the unused Python `pyproject.toml` metadata from the Node.js CLI package root.
