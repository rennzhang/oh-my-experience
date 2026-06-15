---
title: 快速开始
status: active
---

# 快速开始

这篇指南只做一件事：让你尽快看到 OME 的第一次有效召回。先安装、初始化，再用一
个真实编码任务看看哪张经验卡会被召回。

## 1. 安装

```bash
git clone https://github.com/rennzhang/oh-my-experience.git
cd oh-my-experience
npm install
npm run build
```

这会直接使用当前仓库代码，适合在 `0.1.0` 正式发布到 npm 前试用。发布后可以改用：

```bash
npx oh-my-experience@latest init
```

## 2. 初始化

把这段话复制给 Agent：

```text
帮我设置 Oh My Experience：

1. 运行 `node bin/ome.js init`，除非有明确理由，否则保留默认经验库路径。
2. 告诉我 Codex 或 Claude hook 安装是否需要我确认。
3. 先不要开始复盘扫描。
```

`init` 会创建本地经验库、安装 OME Codex skill，并可为支持的 Agent 安装
prompt-time hook。它可以重复运行。

## 3. 看一次召回解释

把这段话复制给 Agent：

```text
给我看一次 OME 召回示例：

node bin/ome.js match "修复登录页面 UI，在浏览器里验证效果" --explain

说明命中了哪张经验卡、为什么命中、以及会注入什么精简上下文。
```

内置示例卡让你在还没有创建自己的经验卡前就能看到召回效果。这里的 match 结果只是
候选列表：Agent 仍然要判断卡片是否真的适合当前任务，再决定是否读取完整规则。

## 4. 需要时检查健康状态

安装看起来不对，或者准备发版前，再做健康检查：

```bash
node bin/ome.js doctor
node bin/ome.js hook status --provider codex
node bin/ome.js hook status --provider claude
```

`doctor` 会检查经验库、配置、包身份、hook 和卡片结构。它适合排障，但产品的第一
个证明应该是召回，而不是绿色状态页。

## 5. 下一步

- 创建第一张真实经验卡：[第一张经验卡](first-card.md)
- 查看完整 `/goal` 示例：[实际案例](examples.md)
- 为仓库添加项目级经验库：[全局与项目经验库](project-libraries.md)
- 单独配置 Codex 或 Claude hook：[Codex](codex.md)、[Claude](claude.md)

## 快速参考

| 我想... | 命令 |
|---------|------|
| 初始化 OME | `node bin/ome.js init` |
| 测试召回 | `node bin/ome.js match "任务描述" --explain` |
| 检查健康状态 | `node bin/ome.js doctor` |
| 查看 hook | `node bin/ome.js hook status --provider codex` |
| 创建项目经验库 | `node bin/ome.js project init` |
| 开始复盘 | `node bin/ome.js reflect start --focus "关注方向"` |
