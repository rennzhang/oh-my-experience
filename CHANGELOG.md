# Changelog

All notable user-visible changes to Oh My Experience are tracked here.

This project uses concise release notes focused on behavior, packaging, docs, and
compatibility. Internal refactors are listed only when they affect users,
contributors, or release safety.

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
