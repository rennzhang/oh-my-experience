---
title: Claude 指南
status: active
---

# Claude 指南

Claude 使用和 Codex 相同的 provider-neutral hook runtime。同一套经验卡、同一个
召回引擎。

## 支持的映射

| Claude event | Normalized event |
| --- | --- |
| `UserPromptSubmit` | `prompt.submit` |

## Hook 和 Skill 安装

```bash
ome init --provider claude --dry-run   # 预览
ome init --provider claude             # 安装
```

安装器会把 hook 写入 `~/.claude/settings.json`，并把内置 OME skill 安装到
`~/.claude/skills/oh-my-experience`。

**让 Agent 帮你：**

```text
帮我安装 Oh My Experience 的 Claude hook。

1. 先运行 `ome init --provider claude --dry-run`，预览会写入哪些配置。
2. 如果预览没有风险，再运行 `ome init --provider claude`。
3. 运行 `ome hook status --provider claude`，确认 hook 已启用。
```

## 同时用 Codex 和 Claude

如果你两个都装：

```bash
ome init --provider all
```

同一套经验库，同一个召回引擎，两边自动共享。OME 会给选中的 Agent 同步安装 hook
和 skill，不需要维护两份规则。

## 用 Claude Agent 做复盘

完整复盘 prompt，复制使用：

```text
帮我对最近编码会话做一次 OME reflect 复盘扫描。

1. 用 OME reflect 流程浏览近期对话中我纠正过你的地方。
2. 提炼 ≤5 条经验草稿，只保留以后能复用的执行判断。
3. 完成后只给我经验草稿审批链接和简短说明，不要让我看 JSON、内部文件或候选 schema。
4. 如果我继续补充想法、反例或修改意见，就优化同一次复盘，不要另开一轮。
5. 等我明确说“确认入库”后，再把通过的经验入库。

只提取真正能复用的执行判断。不要把一次性上下文写成经验卡。
```

## 规则

不要为 Claude 分叉 retrieval logic。Claude 相关代码只处理 hook input、
install/status 路径、output formatting，以及临时 user-only 证据索引用的原生会话解析。
