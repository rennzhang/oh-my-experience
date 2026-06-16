---
title: 快速开始
status: active
---

# 快速开始

这篇指南只做一件事：让你尽快看到 OME 的第一次有效召回。先初始化经验库，再把一个
真实任务交给 Agent，看 OME 是否自动带出相关经验。

## 1. 初始化

```bash
npx oh-my-experience@latest init
```

这会通过 npm 运行最新发布版 OME CLI，创建本地经验库，并让你选择要连接哪些 Agent。
对每个选中的 Agent，OME 会安装 prompt-time hook 和内置 skill。Codex 是当前验证最
充分的路径；Claude 使用同一套 hook runtime。它可以重复运行。

如果想全局安装命令：

```bash
npm install -g oh-my-experience
ome init
```

## 2. 把真实任务发给 Agent

把这段话复制给 Agent：

```text
创建目标并开干：在 /tmp/ome-todo-demo 里做一个小型单页 Todo 应用，使用原生 HTML、CSS 和 JavaScript。
它需要支持新增任务、标记完成、删除任务、清空已完成、显示剩余数量、用 localStorage 保存任务，并且在窄屏手机视口下也可用。
完成前请通过真实浏览器入口验证。
完成后，请引导我走一遍 OME 生命周期：全量扫描这次运行，总结可复用经验，和我一起审查生成的草稿，然后只把确认通过的草稿加入经验库。
```

已安装的 hook 会在 prompt 阶段自动召回。用户不需要手动跑搜索命令来证明安装成功。
内置示例卡让你在还没有创建自己的经验卡前，就能看到第一次自动召回。

## 3. 需要时检查健康状态

安装看起来不对，或者准备发版前，再做健康检查：

```bash
npx oh-my-experience@latest doctor
npx oh-my-experience@latest hook status --provider codex
npx oh-my-experience@latest hook status --provider claude
```

`doctor` 会检查经验库、配置、包身份、hook、skill 和卡片结构。它适合排障，但产品的第一
个证明应该是召回，而不是绿色状态页。

## 4. 下一步

- 创建第一张真实经验卡：[第一张经验卡](first-card.md)
- 查看完整 `/goal` 示例：[实际案例](examples.md)
- 为仓库添加项目级经验库：[全局与项目经验库](project-libraries.md)
- 单独配置 Codex 或 Claude：[Codex](codex.md)、[Claude](claude.md)

## 快速参考

| 我想... | 命令 |
|---------|------|
| 初始化 OME | `npx oh-my-experience@latest init` |
| 检查健康状态 | `npx oh-my-experience@latest doctor` |
| 查看 hook | `npx oh-my-experience@latest hook status --provider codex` |
| 创建项目经验库 | `npx oh-my-experience@latest project init` |
| 开始复盘 | `npx oh-my-experience@latest reflect start --focus "关注方向"` |

本地源码开发时，先运行 `npm install && npm run build`，再用 `node bin/ome.js`。
