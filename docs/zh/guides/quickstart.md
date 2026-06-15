---
title: 快速开始
status: active
---

# 快速开始

这篇指南只做一件事：让你尽快看到 OME 的第一次有效召回。先初始化经验库，再用一个
真实编码任务看看哪张经验卡会被召回。

## 1. 初始化

```bash
npx oh-my-experience@latest init
```

这会通过 npm 运行最新发布版 OME CLI，创建本地经验库，安装 OME Codex skill，并可
为支持的 Agent 安装 prompt-time hook。它可以重复运行。

如果想全局安装命令：

```bash
npm install -g oh-my-experience
ome init
```

## 2. 看一次召回解释

把这段话复制给 Agent：

```text
给我看一次 OME 召回示例：

npx oh-my-experience@latest match "修复登录页面 UI，在浏览器里验证效果" --explain

说明命中了哪张经验卡、为什么命中、以及会注入什么精简上下文。
```

内置示例卡让你在还没有创建自己的经验卡前就能看到召回效果。这里的 match 结果只是
候选列表：Agent 仍然要判断卡片是否真的适合当前任务，再决定是否读取完整规则。

## 3. 需要时检查健康状态

安装看起来不对，或者准备发版前，再做健康检查：

```bash
npx oh-my-experience@latest doctor
npx oh-my-experience@latest hook status --provider codex
npx oh-my-experience@latest hook status --provider claude
```

`doctor` 会检查经验库、配置、包身份、hook 和卡片结构。它适合排障，但产品的第一
个证明应该是召回，而不是绿色状态页。

## 4. 下一步

- 创建第一张真实经验卡：[第一张经验卡](first-card.md)
- 查看完整 `/goal` 示例：[实际案例](examples.md)
- 为仓库添加项目级经验库：[全局与项目经验库](project-libraries.md)
- 单独配置 Codex 或 Claude hook：[Codex](codex.md)、[Claude](claude.md)

## 快速参考

| 我想... | 命令 |
|---------|------|
| 初始化 OME | `npx oh-my-experience@latest init` |
| 测试召回 | `npx oh-my-experience@latest match "任务描述" --explain` |
| 检查健康状态 | `npx oh-my-experience@latest doctor` |
| 查看 hook | `npx oh-my-experience@latest hook status --provider codex` |
| 创建项目经验库 | `npx oh-my-experience@latest project init` |
| 开始复盘 | `npx oh-my-experience@latest reflect start --focus "关注方向"` |

本地源码开发时，先运行 `npm install && npm run build`，再用 `node bin/ome.js`。
