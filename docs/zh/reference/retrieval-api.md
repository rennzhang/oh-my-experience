---
title: 召回 API
status: active
---

# 召回 API


## 输入

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
  "surfaces": ["frontend", "test"],
  "risks": ["validation"],
  "operations": ["review"],
  "constraints": ["必须", "真实"],
  "files": ["packages/cli/src/main.ts"],
  "commands": ["npm test"],
  "keywords": ["UI", "browser", "validate"],
  "language": "mixed",
  "segments": ["Fix UI and validate in browser"]
}
```

## Match Output

```json
{
  "cardId": "browser-validation",
  "score": 12.4,
  "recall_policy": "must",
  "reasons": [
    { "field": "triggers", "term": "browser validation", "weight": 5 },
    { "field": "topics", "term": "frontend", "weight": 2 }
  ]
}
```

`applicability` 与检测到的 `projectContext` 不匹配的卡片，会在评分前被过滤掉。

CLI explain surface 会把同一数据包裹成 envelope 和 query diagnostics：

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
  "matches": [
    {
      "rank": 1,
      "id": "browser-validation",
      "score": 12.4,
      "reasons": [],
      "similarCards": [
        {
          "id": "browser-validation-overlap",
          "title": "Browser smoke checklist",
          "score": 82,
          "reason": "标题、触发词或主题高度接近"
        }
      ]
    }
  ],
  "additionalContext": "Potentially relevant OME lessons. Use only when directly applicable; ignore if unrelated or conflicting.\\nKeyword matches can be ambiguous; compare each lesson's workflow meaning, use cases, and ignore cases against the current request before applying it.\\n..."
}
```

`similarCards` 列出因为近似重复而从 ranked output 中省略的卡片。Renderer 可以提到这些 omitted related cards，但不应注入重复的完整经验。

`additionalContext` 的框架提示固定使用英文。卡片正文保持存储时的语言。

## Budgeted Context

```json
{
  "cards": ["browser-validation"],
  "additionalContext": "...",
  "truncated": false,
  "budgetUsedChars": 1200
}
```
