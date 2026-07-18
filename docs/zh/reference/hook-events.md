---
title: Hook 事件
status: active
---

# Hook 事件


本页只记录当前已接入 OME hook 运行时的真实事件。

## 规范化事件名

```text
prompt.submit
```

## Prompt Submit

用于用户提交提示词时的提示词阶段召回。

Provider 映射：

| Provider | Native event | Normalized event |
| --- | --- | --- |
| Codex | Codex hook input | `prompt.submit` |
| Claude | `UserPromptSubmit` | `prompt.submit` |

Hook 日志事件：

```json
{
  "id": "uuid",
  "kind": "hook",
  "schemaVersion": 2,
  "engineVersion": "sparse-v2",
  "scorerVersion": "bm25f-evidence-v2",
  "libraryFingerprint": "sha256",
  "cardSetFingerprint": "sha256",
  "globalCardSetFingerprint": "sha256",
  "configFingerprint": "sha256",
  "event": "prompt.submit",
  "provider": "codex",
  "sessionId": "optional-session-id",
  "turnId": "optional-turn-id",
  "promptHash": "sha256",
  "rawPrompt": "仅在 privacy.saveRawPrompt 为 true 时存在",
  "taskEnvelope": {
    "summaryHash": "sha256",
    "taskTypes": ["ui"],
    "files": ["hashed-file-token"],
    "commands": ["hashed-command-token"],
    "risks": ["hashed-risk-token"],
    "surfaces": ["hashed-surface-token"],
    "keywords": ["hashed-keyword-token"],
    "length": 30
  },
  "projectContext": {
    "hasProject": true,
    "projectKeyHash": "sha256",
    "modulePathHash": "sha256",
    "source": "git"
  },
  "libraries": [
    { "scope": "global", "exists": true, "readable": true, "warningCount": 0 },
    { "scope": "project", "exists": true, "readable": true, "warningCount": 0 }
  ],
  "queryVariants": ["hashed-query-variant"],
  "candidateStage": {
    "available": true,
    "complete": true,
    "count": 1,
    "truncated": false,
    "unavailableReason": null,
    "cards": [
      {
        "id": "browser-validation",
        "libraryScope": "project",
        "score": 80,
        "rawScore": 12.7,
        "rankScore": 32.1,
        "postSelectionScore": 80,
        "priorityScore": 7,
        "evidenceFamilies": ["triggers", "signals"],
        "strongAnchor": true,
        "eligible": true,
        "selected": true,
        "rejectionReason": null,
        "reasons": []
      }
    ]
  },
  "selectionStage": {
    "selectedCardIds": ["browser-validation"],
    "cards": [
      {
        "id": "browser-validation",
        "libraryScope": "project",
        "score": 80,
        "rawScore": 12.7,
        "rankScore": 32.1,
        "postSelectionScore": 80,
        "priorityScore": 7,
        "evidenceFamilies": ["triggers", "signals"],
        "strongAnchor": true,
        "eligible": true,
        "selected": true,
        "rejectionReason": null,
        "reasons": [
          { "field": "ruleSignals", "term": "ui_surface", "weight": 48, "kind": "UI, frontend, or browser surface wording" }
        ]
      }
    ]
  },
  "matchedCards": [{ "id": "browser-validation", "libraryScope": "project", "score": 80 }],
  "matched": true,
  "renderedCardIds": ["browser-validation"],
  "rendered": true,
  "contextTruncated": false,
  "deliveryStatus": "unknown",
  "injected": true,
  "durationMs": 42,
  "budgetUsedChars": 860,
  "error": null,
  "createdAt": "2026-05-28T00:00:00.000Z"
}
```

规范化后的必需字段：

- `event`
- `provider`
- `schemaVersion`
- `engineVersion`
- `scorerVersion`
- `promptHash`
- `taskEnvelope`
- `candidateStage`
- `selectionStage`
- `renderedCardIds`
- `deliveryStatus`
- `createdAt`

Hook 日志始终保存 prompt hash、脱敏 task envelope、hashed query variants 和命中
卡片证据。明确开启 `privacy.saveRawPrompt` 后，同一条事件还会把提交的 prompt
以明文写入 `rawPrompt`；默认情况下该字段不存在。

Schema v2 拆开不同阶段，不声称 runtime 无法证明的事情：

- `matched` 和 `selectionStage` 表示 retrieval 选择了卡片；
- `rendered` 和 `renderedCardIds` 表示这些卡片进入生成的 additional context；
- `contextTruncated` 表示 context budget 省略了部分 selected cards；
- `candidateStage.count` 是已评估总数，`truncated` 表示有界的 `cards` 列表是否省略候选行；
- `deliveryStatus` 是 `unknown`，因为 OME 无法观察 host 或 model 是否消费了 context；
- `injected` 是 deprecated compatibility alias，只等于 `rendered`，不能证明 delivery；
- hook budget 内无法拿到完整 candidate stage 时，diagnostics 可以标记 unavailable 或
  incomplete。

Engine/scorer versions 和 card-set/configuration fingerprints 让 stats 能把当前可比
snapshot 与累计历史 events 分开。
可比的 `current` 视图只统计全局经验库：它要求全局 card-set 与 retrieval config
都等于当前值，并从 match/render 计数中排除项目卡。`cumulative` 保留所有 schema
版本和项目卡事件，供历史分析。`coverageRate`、`renderRate` 等兼容字段映射到全局
`current` 视图。

Hook 日志写入全局 `dataDir`。项目经验库只参与召回读取，prompt-time match 和 hook
路径不会写项目 events。
