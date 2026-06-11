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

## How To Use Matches

1. Read only matched `active` cards.
2. Summarize them as a short task constraint list.
3. Apply constraints only when they truly fit the current task.
4. Preserve the user's latest request as the source of truth.
5. Do not paste full card bodies into the final answer unless asked.

## Quality Rules

- Treat `goal`, `review`, `release`, and similar overloaded terms carefully; they may be ordinary business words, not agent workflow triggers.
- Project-specific cards should only affect matching projects or project families.
- If recall feels noisy, tune triggers, aliases, negative triggers, categories, or applicability before changing scoring code.

## Retrieval Eval

Before changing recall logic, run deterministic evals:

```bash
ome eval recall --json
ome eval recall --suite <suite.json> --json
ome eval recall --compare <before-report.json> <after-report.json>
```

Eval fixtures must stay isolated from the user's real OME library.
