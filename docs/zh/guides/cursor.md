---
title: Cursor 指南
status: active
---

# Cursor 指南

Cursor 和 Codex、Claude 共用同一套 provider-neutral hook runtime。同一套经验卡，
同一个召回引擎。Cursor 支持是原生 adapter，不是 Claude 兼容开关的顺便产物。

## 支持的映射

| Cursor 事件 | 归一化事件 |
| --- | --- |
| `beforeSubmitPrompt` | `prompt.submit` |

运行时用 Cursor 的 `workspace_roots` 做项目感知召回。不要依赖 hook 进程的
working directory；用户级 Cursor hook 会从 `~/.cursor` 执行。

## 安装 Hook 和 Skill

```bash
ome init --provider cursor --dry-run   # 预览
ome init --provider cursor             # 安装
```

安装器写入 `~/.cursor/hooks.json` 的 `beforeSubmitPrompt`，并把内置 OME skill
装到 `~/.cursor/skills/oh-my-experience`。它会与现有 Cursor hook 合并，不删除
无关命令。

**让 Agent 来做：**

```text
帮我安装 Oh My Experience 的 Cursor hook。

1. 先运行 `ome init --provider cursor --dry-run`，预览会写入哪些配置。
2. 如果预览没有风险，再运行 `ome init --provider cursor`。
3. 最后运行 `ome hook status --provider cursor`，确认 hook 已启用。
```

Cursor Desktop 和 Cursor Agent CLI 都会在交互提交时跑项目级和用户级 hook。
`cursor-agent --print` 的第一条参数不是可靠的召回路径。

如果 Cursor 还通过第三方 hook 加载了 Claude 的 OME hook，`ome doctor` 会警告。
Cursor 路径以原生 Cursor hook 为准。

## 和 Codex / Claude 一起用

```bash
ome init --provider all
```

一个经验库，一个召回引擎。`all` 会安装 Codex、Claude 和 Cursor。

## 规则

不要为 Cursor 分叉召回逻辑。Cursor 专用代码只处理 hook 安装/状态路径、payload
归一，以及原生 `hooks.json` 形状。
