---
schema: ome-card
id: example-card
status: draft
title: Example Experience Card
category: 测试验收
summary: 一句话说明这张卡解决的重复执行问题、适用场景、排除场景和期望动作。
criteria:
  use_when:
    - 用户提示词或任务上下文出现明确适用场景
  ignore_when:
    - 只是讨论概念、示例或文档，不要求实际执行
engine_hints:
  positive:
    - concrete positive retrieval signal
  negative:
    - concrete near-miss signal to suppress
recall:
  policy: should
  risk: medium
  confidence: medium
  triggers:
    - concrete trigger phrase
  topics:
    - module or workflow
scope:
  level: global
---

# Example Experience Card

## 这张卡解决什么问题

用通俗语言说明：过去哪里容易误判、什么时候应该想起这张卡、什么时候不要用。

## 使用标准

适用：
- 列出模型容易理解的自然语言判断标准。

不适用：
- 列出常见误触发场景。

## 完整规则

```text
写入复盘总结出来的完整可执行规则。这里应该是模型真正读取后执行的核心内容。
```
