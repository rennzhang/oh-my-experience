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
3. Apply constraints only when they truly fit the current task.
4. Preserve the user's latest request as the source of truth.
5. Do not paste full card bodies into the final answer unless asked.

## Quality Rules

- Treat `goal`, `review`, `release`, and similar overloaded terms carefully; they may be ordinary business words, not agent workflow triggers.
- Treat matched cards as candidates, not commands. Apply a card only when its workflow meaning fits the current task.
- Use the natural-language `Use if` and `Ignore if` lines as the main decision boundary.
- Treat engine hints as recall heuristics, not as instructions to the model.
- Use `ome match --explain --json` when a match looks surprising; inspect natural-language criteria, engine hint reasons, and match reasons before changing the card or scoring.
- Project-specific cards should only affect matching projects or project families.
- Project-library cards are already physically scoped by repository; do not add fragile project-key requirements unless the card should also be copied elsewhere and still filter itself.
- If recall feels noisy, tune `criteria.use_when`, `criteria.ignore_when`, `recall.triggers`, `engine_hints`, category, or scope before changing scoring code.

## Retrieval Eval

Before changing recall logic, run deterministic evals:

```bash
ome eval recall --json
ome eval recall --suite <suite.json> --json
ome eval recall --compare <before-report.json> <after-report.json>
```

Eval fixtures must stay isolated from the user's real OME library.
