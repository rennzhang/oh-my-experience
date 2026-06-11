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

Payload：

```json
{
  "event": "prompt.submit",
  "provider": "codex",
  "sessionId": "optional-session-id",
  "turnId": "optional-turn-id",
  "cwd": "/path/to/project",
  "prompt": "raw prompt if provided by hook input",
  "promptHash": "sha256",
  "timestamp": "2026-05-28T00:00:00.000Z"
}
```

规范化后的必需字段：

- `event`
- `provider`
- `promptHash`
- `timestamp`

`prompt` 只在运行时管线内可用。除非显式启用 raw prompt storage，否则不能写入
hook 日志。
