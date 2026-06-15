---
title: Hook 运行时
status: active
---

# Hook 运行时


## 目标

用一套 provider-neutral 运行时支持 Codex 和 Claude 的提示词阶段召回。

共享流程：

```text
provider hook input
  -> provider adapter
  -> normalized prompt.submit event
  -> retrieval engine
  -> context budget
  -> provider output adapter
  -> hook log
```

## 规范化事件

已安装 hook 路径当前使用 `prompt.submit`。规范 payload schema 见
[Hook Events](../reference/hook-events.md)。

## Codex Adapter

Codex hook input 映射为 `prompt.submit`。

输出 adapter 返回 Codex 需要的 additional context 结构。

## Claude Adapter

Claude `UserPromptSubmit` 映射为 `prompt.submit`，并返回包含
`additionalContext` 的 Claude hook JSON。

安装命令：

```bash
ome init --provider claude
```

提示词进入 hook 时，共享运行时会检测当前工作目录，推导 project context，然后在
评分前应用每张卡片的 `scope`。

如果项目根目录下存在 `<project-root>/.oh-my-experience/`，runtime 会把它和全局
`dataDir` 经验库一起读取。读取路径 fail-open：项目库不存在或不可读时，全局召回仍然
可用。

## 热路径约束

Hook runtime 必须：

- 内部错误时 fail open；
- 避免 LLM、网络和长耗时 source scan；
- 避免写 active cards；
- 默认不保存原始 prompt；
- 记录结构化事件，供 stats 和 debugging 使用；
- 记录脱敏后的 project context；
- hook events 写入全局 `dataDir`，不写入项目经验库；
- 在 `retrieval.hookTimeoutMs` 内完成，让大库超时也 fail open，而不是阻塞 Agent
  prompt path。

## 日志

Hook events 应保存：

- event type；
- provider；
- prompt hash；
- task envelope；
- matched card ids；
- 是否注入；
- latency；
- warning 或 timeout class。

原始 prompt 只能 opt-in 保存。
