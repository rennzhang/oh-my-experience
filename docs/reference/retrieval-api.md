---
title: Retrieval API
status: active
---

# Retrieval API


## Input

```json
{
  "prompt": "Fix UI and validate in browser",
  "provider": "codex",
  "cwd": "/path/to/project",
  "limit": 8,
  "budget": {
    "maxChars": 6000
  }
}
```

## Task Envelope

```json
{
  "summary": "Fix UI and validate in browser",
  "language": "en",
  "taskTypes": ["ui"],
  "surfaces": ["ui"],
  "risks": [],
  "operations": ["fix"],
  "constraints": [],
  "files": [],
  "commands": [],
  "intentModes": [],
  "ruleSignals": [
    {
      "id": "ui_surface",
      "polarity": "positive",
      "weight": 14,
      "reason": "UI, browser, or frontend validation wording"
    }
  ],
  "keywords": ["UI", "browser", "validate"],
  "negativeKeywords": [],
  "segments": ["Fix UI and validate in browser"],
  "length": 30
}
```

## Match Output

```json
{
  "rank": 1,
  "id": "browser-validation",
  "title": "Browser Validation",
  "score": 12.4,
  "recallPolicy": "must",
  "risk": "high",
  "confidence": "high",
  "summary": "Open the real browser after UI changes.",
  "card": {
    "libraryScope": "project"
  },
  "reasons": [
    { "field": "triggers", "term": "browser validation", "weight": 5 },
    { "field": "topics", "term": "frontend", "weight": 2 }
  ],
  "similarCards": []
}
```

Cards whose active-card `scope` does not match the detected `projectContext`
are filtered out before scoring.

The CLI explain surface wraps the same data with envelope and query diagnostics:

```bash
ome match "Fix UI and validate in browser" --explain --json
```

```json
{
  "ok": true,
  "queryVariants": ["Fix UI and validate in browser", "ui test browser validate"],
  "projectContext": {
    "projectKey": "github.com/example/app",
    "modulePath": "apps/web",
    "source": "git"
  },
  "libraries": [
    { "scope": "global", "exists": true, "readable": true },
    { "scope": "project", "exists": true, "readable": true }
  ],
  "matches": [
    {
      "rank": 1,
      "id": "browser-validation",
      "score": 12.4,
      "card": {
        "libraryScope": "project"
      },
      "reasons": [
        { "field": "ruleSignals", "term": "ui_surface", "weight": 14 }
      ],
      "similarCards": [
        {
          "id": "browser-validation-overlap",
          "title": "Browser smoke checklist",
          "score": 82,
          "reason": "title, triggers, or topics are highly similar"
        }
      ]
    }
  ],
  "additionalContext": "OME matched experience cards. Matched does not mean used: apply a card only when its workflow meaning fits the current task; ignore unrelated or conflicting cards.\\nBefore acting, if any matched card is applicable, state in one short sentence what OME reminded you to consider, then proceed normally. For OME retrospective or source-scan tasks, matched subject-area cards are not source evidence; record them only as active-card overlap unless you applied a process/governance card. Final report: if you actually used any card, add one final line `**本次使用 N条 OME 经验卡：** ...` using only the `Final link if used` values for cards you applied; omit the line if none applied.\\n..."
}
```

`libraries` describes the global/project library stack used for the match.
Project cards include `libraryScope: project`; their rendered full-card command
uses `ome experience show CARD_ID --scope project --section rule`.

`similarCards` lists near-duplicates that were omitted from the ranked output.
The renderer can mention them as omitted related cards, but it should not inject
duplicate full lessons.

`ruleSignals` are internal recall hints derived from the prompt. Positive
engine hints boost cards when the prompt strongly resembles the right workflow;
negative engine hints suppress common false positives. They are heuristic
signals, not the final usage standard. Hook context renders natural-language
criteria and match reasons instead of exposing hint ids.

`additionalContext` uses a fixed English frame and contains only compact index
information. Card rule bodies are not injected. Matched cards are candidates,
not proof that the agent used them. The frame tells the agent to ignore
unrelated or conflicting cards, fetch the rule only when a card applies, and to
mention only cards it actually used in the final response:
`**本次使用 N条 OME 经验卡：** [Card title](<card-path>)`.
For retrospective or source-scan tasks, matched subject-area cards are overlap
signals, not source evidence; they should be recorded in the retrospective audit
rather than disclosed as used cards.
Card titles are rendered as Markdown links to the relevant experience card
paths.

## Budgeted Context

```json
{
  "cards": ["browser-validation"],
  "additionalContext": "...",
  "truncated": false,
  "budgetUsedChars": 1200
}
```
