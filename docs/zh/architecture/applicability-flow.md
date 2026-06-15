---
title: 适用范围流程
status: active
---

# 适用范围流程


`scope` 控制一张卡片允许在哪些场景出现。通用经验保持通用，项目相关
经验保持收敛。

## 端到端路径

```text
session/source-scan/retrospective
  -> candidate.scope
  -> reflect decision can override scope
  -> draft preserves scope
  -> active index stores scope
  -> hook runtime detects projectContext
  -> retrieval filters by scope
  -> scoring and context rendering
```

## 项目上下文

运行时会从当前工作目录推导项目上下文：

- 可用时读取仓库根目录和 Git remote；
- 没有 Git remote 时读取 package metadata；
- 记录相对项目根目录的 module path；
- hook 日志只保存脱敏 hash，不保存原始本地路径。

## 级别

- `global`：任何项目都可使用。
- `project`：只有当前 `projectKey` 匹配时才可使用。
- `project-family`：项目族匹配时可使用，例如同一个 GitHub owner 或组织。

## 产品规则

不要在 setup 阶段要求用户手动分类每条经验。`init` 负责完成设置；reflect
生成的经验草稿会携带推断出的适用范围，`ome reflect decide` 可以在创建草稿前修正它。

手动编辑卡片是辅助路径。reflect 指南应先根据来源上下文推断适用范围；用户只在
推断范围错误时修正。
