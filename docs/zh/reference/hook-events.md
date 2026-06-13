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
  "event": "prompt.submit",
  "provider": "codex",
  "sessionId": "optional-session-id",
  "turnId": "optional-turn-id",
  "promptHash": "sha256",
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
    "projectKey": "github.com/example/app",
    "modulePath": "apps/web",
    "source": "git"
  },
  "libraries": [
    { "scope": "global", "exists": true, "readable": true, "warningCount": 0 },
    { "scope": "project", "exists": true, "readable": true, "warningCount": 0 }
  ],
  "queryVariants": ["hashed-query-variant"],
  "matchedCards": [
    {
      "id": "browser-validation",
      "score": 80,
      "reasons": [
        { "field": "ruleSignals", "term": "ui_surface", "weight": 14, "kind": "UI, browser, or frontend validation wording" }
      ]
    }
  ],
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
- `promptHash`
- `taskEnvelope`
- `matchedCards`
- `createdAt`

原始 prompt 只在运行时管线内可用。Hook 日志只保存 hash、脱敏 task envelope、
hashed query variants 和命中卡片证据。除非显式启用 raw prompt storage 做调试，否则
不能写入原始 prompt 文本。

Hook 日志写入全局 `dataDir`。项目经验库只参与召回读取，prompt-time match 和 hook
路径不会写项目 events。
