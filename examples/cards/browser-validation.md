---
id: browser-validation
status: active
title: Browser Validation For UI Changes
category: 测试验收
triggers:
  - UI 验收
  - 浏览器验证
negative_triggers:
  - 纯后端迁移
topics:
  - frontend
  - browser
applicability:
  level: global
recall_policy: must
risk: high
sources:
  - example
created: 2026-05-28T00:00:00.000Z
updated: 2026-05-28T00:00:00.000Z
---

# 前端改动必须做真实浏览器验收

## Problem
UI 改动在静态代码审查里看起来正确，但真实浏览器路径仍可能失败。

## Anti-pattern
把测试或静态检查当成可见工作流已经可用的证明。

## Correct approach
打开真实页面，按用户路径操作，并检查可见状态和浏览器控制台错误。
