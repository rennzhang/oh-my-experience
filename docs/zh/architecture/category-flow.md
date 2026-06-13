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
- 分类是 candidate 和 card 携带的自由文本 metadata。当前没有单独的 category registry 命令。
- Review 默认路径必须轻：在 worksheet 中展示分类，只在推断分类错误时覆盖。

## 默认分类

默认分类只是起点，不是封闭 taxonomy。需要新分类时，candidate 或 card 可以直接携带新的分类名称。项目适配关系属于 `scope`，不应该塞进分类名称。
