---
schema: ome-card
id: browser-validation
status: active
title: Browser Validation For UI Changes
category: 测试验收
summary: 当任务改动 UI、前端页面或可见交互时，静态检查不能证明用户路径可用；应打开真实浏览器验证，并排除纯后端、文档或不可见配置任务。
criteria:
  use_when:
    - 修改前端页面、组件、样式、交互或可视化状态
    - 用户要求确认 UI、页面、浏览器、控制台或真实用户路径
  ignore_when:
    - 纯后端迁移、脚本或配置任务，没有可见页面变化
    - 只是在文档中描述浏览器验证流程
engine_hints:
  positive:
    - UI browser validation
    - real browser smoke
    - frontend visible change
  negative:
    - backend-only migration
    - documentation-only example
recall:
  policy: must
  risk: high
  confidence: high
  triggers:
    - UI 验收
    - 浏览器验证
    - real browser validation
  topics:
    - frontend
    - browser
scope:
  level: global
---

# 前端改动必须做真实浏览器验收

## 这张卡解决什么问题

UI 改动在静态代码审查里看起来正确，但真实浏览器路径仍可能失败。这张卡提醒 Agent：只要用户会看到页面或交互，就要用真实浏览器完成验收，而不是只依赖测试、类型检查或代码阅读。

## 使用标准

适用：
- 改动页面、组件、样式、状态反馈、布局、图表或任何用户可见交互。
- 用户要求“浏览器验证”“看一下页面”“确认 UI”“检查控制台”等真实页面证据。

不适用：
- 纯后端、数据库、CLI、文档或不可见配置改动。
- 只是写示例、说明流程或讨论是否需要浏览器验证。

## 完整规则

```text
当任务包含 UI、前端页面、组件、样式、可视化状态或用户可见交互变更时，完成前必须打开真实浏览器，从用户实际入口验证渲染、交互、状态反馈和控制台错误。测试、类型检查、静态审查或代码写完都不能单独证明 UI 可用。
```
