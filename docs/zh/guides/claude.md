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

> 帮我安装 Oh My Experience 的 Claude hook。先 ome init --provider claude --dry-run
> 预览，确认无误后 ome init --provider claude。

## 同时用 Codex 和 Claude

如果你两个都装：

```bash
ome init --provider all
```

同一套经验库，同一个召回引擎，两边自动共享。不需要维护两份规则。

## 用 Claude Agent 做复盘

完整复盘 prompt，复制使用：

```
帮我对最近编码会话做一次 OME reflect 复盘扫描。

1. 先 ome reflect start --focus "最近纠正过的执行错误"
2. 浏览近期对话中我纠正过你的地方
3. 生成 ≤5 条候选经验，每条包含：问题、反模式、正确做法、触发条件、抑制条件
4. 写入候选文件后 ome reflect candidates RUN_ID --from-file FILE
5. ome reflect show RUN_ID 展示，等我逐条审批

只提取真正能复用的执行判断。不要把一次性上下文写成经验卡。
```

## 规则

不要为 Claude 分叉 retrieval logic。Claude adapter 只处理 hook input、
install/status 路径和 output formatting。