---
title: 分类流程
status: active
---

# 分类流程


分类不是只用于视觉筛选的字段，而是 reflect 到 recall 生命周期的一部分。

## 端到端路径

```text
session/source
  -> reflect guide asks for category
  -> candidateFromLesson keeps or infers category
  -> reflect decision can override category
  -> ome reflect apply creates draft with category
  -> approve draft creates active card with category
  -> library filters and edits by category
  -> card index includes category for recall and display
```

## 产品规则

- `category` 是 candidate、card 和 active index 上的一等字段。
- `sources` 只记录证据和来源。不要把分类写成 source 值。
- reflect candidate generation 应提供 category。如果缺失，CLI 会根据 title、topics、triggers、summary 和 rule 推断。
- 用户可以先创建分类再分配。允许空分类存在，因为它们可以让后续 candidate intake 更顺畅。
- Review 默认路径必须轻：在 worksheet 中展示分类，只在推断分类错误时覆盖。

## 默认分类

默认分类只是起点，不是封闭 taxonomy。用户可以从 CLI 创建更多分类。项目适配关系属于 `applicability`，不应该塞进分类名称。
