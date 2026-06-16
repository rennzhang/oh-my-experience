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

active 卡片的 `scope` 与检测到的 `projectContext` 不匹配时，会在评分前被过滤掉。

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
          "reason": "标题、触发词或主题高度接近"
        }
      ]
    }
  ],
  "additionalContext": "OME matched experience cards. Matched does not mean used: apply a card only when its workflow meaning fits the current task; ignore unrelated or conflicting cards.\\nBefore acting, if any matched card is applicable, state in one short sentence what OME reminded you to consider, then proceed normally. For OME retrospective or source-scan tasks, matched subject-area cards are not source evidence; record them only as active-card overlap unless you applied a process/governance card. Final report: if you actually used any card, add one final line `**本次使用 N条 OME 经验卡：** ...` using only the `Final link if used` values for cards you applied; omit the line if none applied.\\n..."
}
```

`libraries` 描述本次 match 使用的全局/项目经验库栈。项目卡会带
`libraryScope: project`；渲染出的完整卡片命令会使用
`ome experience show CARD_ID --scope project --section rule`。

`similarCards` 列出因为近似重复而从 ranked output 中省略的卡片。Renderer 可以提到这些 omitted related cards，但不应注入重复的完整经验。

`ruleSignals` 是从 prompt 派生出来的内部召回提示。正向 engine hint 会在 prompt 强烈像目标工作流时加权；负向 engine hint 用于压住常见误召回。它们是启发式，不是最终使用标准。Hook 上下文展示自然语言使用标准和自然语言命中原因，不暴露 hint id。

`additionalContext` 的框架提示固定使用英文，且只包含紧凑索引信息。卡片规则正文不会
被注入。命中卡片只是候选，不代表 Agent 已经采用。框架会要求 Agent 忽略无关或冲突
卡片，只在判断适用后再读取规则，并在最终回复里只披露实际使用过的卡：
`**本次使用 N条 OME 经验卡：** [经验卡名称](<经验卡路径>)`。复盘或来源扫描任务中，
命中的主题旧卡是 active overlap 信号，不是来源证据，应写入复盘审计而不是披露为 used
card。经验卡名称会渲染为指向相关经验卡路径的 Markdown 链接。

## Budgeted Context

```json
{
  "cards": ["browser-validation"],
  "additionalContext": "...",
  "truncated": false,
  "budgetUsedChars": 1200
}
```
