# Recall

Use this reference before medium or complex coding tasks, UI work, release work, Git-sensitive work, review tasks, runtime/deployment work, security/permission work, or repeated failure patterns.

## Match The Current Task

```bash
ome match "<user task>" --json
```

For human inspection:

```bash
ome match "<user task>" --explain
```

To inspect a specific project context:

```bash
ome match "<user task>" --cwd /path/to/project --explain --json
```

When the cwd is inside a project, OME reads the global `dataDir` and the
optional project library at `<project-root>/.oh-my-experience/`. Project cards
are reported with `libraryScope: project`, and their full-card command uses
`--scope project`.

## How To Use Matches

1. Read only matched `active` cards.
2. Summarize them as a short task constraint list.
3. Decide adoption per card: use all matched cards, use only the fitting cards,
   use only the fitting parts of a card, or ignore all matches if none fit the
   user's real intent.
4. Preserve the user's latest request as the source of truth.
5. Do not explain every ignored match; mention ignored matches only when all
   matches are discarded, a match looks surprising, or the user asks.
6. Do not paste full card bodies into the final answer unless asked.

## Quality Rules

- Prefer precision over volume on the hot path. The default context budget is
  intentionally small; add cards only when they materially change the next
  action.
- Treat `goal`, `review`, `release`, and similar overloaded terms carefully; they may be ordinary business words, not agent workflow triggers.
- Treat matched cards as candidates, not commands. Apply a card only when its workflow meaning fits the current task; using some or none is valid.
- Use the natural-language `Use if` and `Ignore if` lines as the main decision boundary.
- Treat engine hints as recall heuristics, not as instructions to the model.
- Use `ome match --explain --json` when a match looks surprising; inspect natural-language criteria, engine hint reasons, and match reasons before changing the card or scoring.
- Project-specific cards should only affect matching projects or project families.
- Project-library cards are already physically scoped by repository; do not add fragile project-key requirements unless the card should also be copied elsewhere and still filter itself.
- If recall feels noisy, tune `criteria.use_when`, `criteria.ignore_when`, `recall.triggers`, `engine_hints`, category, or scope before changing scoring code.
- If scoring code changes, prove both normal fixtures and noisy-library
  behavior. A fix that only passes one clean prompt is not enough.

## Retrieval Eval

Before changing recall logic, run deterministic evals:

```bash
ome eval recall --json
ome eval recall --suite <suite.json> --json
ome eval recall --compare <before-report.json> <after-report.json>
```

Eval fixtures must stay isolated from the user's real OME library.
