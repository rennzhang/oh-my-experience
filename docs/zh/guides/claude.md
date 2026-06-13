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

## Hook 安装

```bash
ome init --provider claude --dry-run   # 预览
ome init --provider claude             # 安装
```

安装器写入 `~/.claude/settings.json`。

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

同一套经验库，同一个召回引擎，两边自动共享。不需要维护两份规则。

## 用 Claude Agent 做复盘

完整复盘 prompt，复制使用：

```text
帮我对最近编码会话做一次 OME reflect 复盘扫描。

1. 先 ome reflect start --focus "最近纠正过的执行错误"
2. 浏览近期对话中我纠正过你的地方
3. 生成 ≤5 条 当前 OME 候选 JSON：包含 audit，以及 summary、criteria.use_when、criteria.ignore_when、recall、可选 engine_hints、scope、rule
4. 写入 candidates.json 后运行 ome reflect candidates RUN_ID --from-file candidates.json
5. ome reflect show RUN_ID 展示，等我逐条审批

只提取真正能复用的执行判断。不要把一次性上下文写成经验卡。
```

## 规则

不要为 Claude 分叉 retrieval logic。Claude adapter 只处理 hook input、
install/status 路径和 output formatting。
