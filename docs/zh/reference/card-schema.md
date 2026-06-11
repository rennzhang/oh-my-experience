---
title: 经验卡片结构
status: active
---

# 经验卡片结构


## 必需字段

```yaml
id: browser-validation
status: active
title: Browser Validation
category: 测试验收
triggers:
  - browser validation
  - UI verification
aliases:
  zh-CN:
    - 浏览器验证
  en:
    - browser smoke
negative_triggers:
  - pure backend migration
topics:
  - frontend
  - test
applicability:
  level: project
  projectKey: github.com/example/app
  modulePath: apps/web
  confidence: high
  rationale: "Only applies to this front-end module."
language: en
recall_policy: must
risk: high
confidence: medium
stale_after: null
sources:
  - retrospective:2026-05-28-example
origin:
  adapter: codex-sessions
  agent: codex
  model: null
  sessionId: 2026-05-28-example
  projectKey: github.com/example/app
  createdBy: retrospective
source_refs:
  - type: retrospective
    ref: 2026-05-28-example
created: 2026-05-28T00:00:00.000Z
updated: 2026-05-28T00:00:00.000Z
```

## 正文区块

推荐区块：

- Problem
- Anti-pattern
- Correct approach
- Recall conditions
- Negative recall conditions
- Evidence
- Revision Notes

## 语言

卡片可以用英文或中文编写。跨语言召回应通过 triggers 和 aliases 处理，而不是在 hook 热路径翻译。

## 生命周期

Reflect candidates 还不是卡片。只有 `active` 卡片可以被召回。

```text
candidate -> draft -> active -> archived
```

Markdown frontmatter 字段名应使用 snake_case。Runtime APIs 内部可以使用 camelCase，但 reference docs 应展示持久化 frontmatter 形式。

## 分类

`category` 是一等 metadata，不是 `sources` 约定。Reflect candidates 生成时应该包含 category；如果缺失，CLI 会根据 title、topics、triggers 和 lesson text 推断。用户可以用 CLI 创建分类，并在应用 reflect run 前覆盖候选分类。

## 来源信息

`origin` 记录经验来自哪里：source adapter、agent 家族、可选 model、session id、
project key，以及它是通过 retrospective、starter lesson、import 还是 manual
方式产生的。`source_refs` 保存结构化引用，可以指向 session、turn、file、
retrospective、starter lesson 或 manual source。`sources` 继续作为简短的人类可读证据列表，用于展示。

## Topics 与 Applicability

`topics` 描述卡片内容，例如 `frontend`、`git`、`runtime` 或 `review`。它们用于匹配和筛选。

`applicability` 描述卡片可以在哪里被召回：

- `global`：任何项目都可使用。
- `project`：只有当前 project key 匹配时召回。
- `project-family`：项目族匹配时召回，例如同一个 GitHub owner。

Hook 会在提示词阶段使用这些信息，让通用卡片保持通用，让范围明确的卡片只在
合适场景出现。
