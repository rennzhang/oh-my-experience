---
title: Evaluation Fixtures
status: active
---

# Evaluation Fixtures

This page documents the fixture shape used by the implemented recall
evaluation command.

## Recall Suite

```json
{
  "name": "core",
  "experiencesFile": "./core.cards.json",
  "cases": [
    {
      "id": "frontend-browser-validation",
      "difficulty": "easy",
      "prompt": "修复 UI 后请在浏览器里验证",
      "expectedCards": ["browser-validation"],
      "unexpectedCards": ["git-commit-safety"],
      "tags": ["frontend", "zh-CN"]
    }
  ]
}
```

Experience fixture file:

```json
{
  "experiences": [
    {
      "id": "browser-validation",
      "status": "active",
      "title": "Browser Validation",
      "triggers": ["browser validation", "浏览器验证"],
      "topics": ["frontend", "test"],
      "applicability": { "level": "global" },
      "recallPolicy": "must",
      "body": "Open the real browser after UI changes."
    }
  ]
}
```

Run:

```bash
ome eval recall --suite <suite.json>
```

The recall suite is deterministic and does not call an AI model.

Default behavior is isolated. Fixture experiences are written to a temporary dataDir.
They do not enter the user's real experience library and cannot affect real
hook behavior.
