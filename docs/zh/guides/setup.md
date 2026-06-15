---
title: 安装配置指南
status: active
---

# 安装配置指南

首次使用优先阅读 [快速开始](quickstart.md)。本指南集中说明安装和配置细节。

## 安装 CLI

直接用 `npx` 运行最新发布版：

```bash
npx oh-my-experience@latest init
```

也可以全局安装命令：

```bash
npm install -g oh-my-experience
ome init
```

全局安装会把 `ome` 命令加入 shell。`ome init` 会启动初始化向导，选择经验库路径、
安装默认 provider 的 hook 和 skill，并写入内置示例卡，方便你马上验证召回。

本地源码开发：

```bash
git clone https://github.com/rennzhang/oh-my-experience.git
cd oh-my-experience
npm install
npm run build
node bin/ome.js init
```

**让 Agent 帮你初始化：**

```text
帮我完成 Oh My Experience 的初始化。

1. 运行 `npx oh-my-experience@latest init`，选择默认经验库路径。
2. 运行 `npx oh-my-experience@latest doctor`，确认经验库、配置和 hook 状态正常。
3. 运行 `npx oh-my-experience@latest hook status --provider codex`，检查 Codex hook 状态。

把每一步的结果告诉我；如果有写入 hook、修改配置或需要我确认的地方，先说明。
```

初始化完成后，把打印出来的第一段任务复制给 Agent，体验内置示例卡的回召效果。

后续可以重复运行 `ome init`。已经有经验库时，向导会沿用当前配置作为默认值。

## 脚本化初始化

非交互环境：

```bash
npx oh-my-experience@latest init -y --data-dir ~/.oh-my-experience
```

`-y` 会跳过交互确认，适合脚本、CI 或 Agent runner。显式传入
`--data-dir` 可以避免初始化到错误目录。

## 配置数据目录

之后可以迁移到任意专用本地目录：

```bash
ome config preview dataDir ~/Documents/Oh-My-Experience  # 预览变更
ome config set dataDir ~/Documents/Oh-My-Experience      # 执行迁移
ome doctor                                                # 确认迁移成功
```

`dataDir` 只控制全局经验库和运行状态，不移动项目经验库。项目经验库始终从
`<project-root>/.oh-my-experience/` 发现；当仓库需要携带自己的卡片时，用
`ome project init` 初始化。

## 安装 Agent 入口

```bash
ome hook status --provider codex     # 查看当前 hook 状态
ome init --provider claude            # 追加 Claude hook 和 skill
ome init --provider all               # 两个 Agent 都装
```

交互式 `ome init` 会让你选择 `codex`、`claude`、`all` 或 `none`。Codex 是当前验证
最充分的路径，但 OME 是基于 hook 的召回层，不是 Codex 专用工具。向导会在写入前展示
写入路径。对每个选中的 Agent，OME 都会安装 prompt-time hook 和内置 skill。

## 卸载

```bash
ome uninstall                         # 移除 hook 和 skill，保留经验库
ome uninstall --provider all          # 移除所有 provider hook 和 skill
ome uninstall --delete-library --yes  # 删除所有本地数据
```

默认卸载只移除 prompt-time 召回入口，经验库数据保留。只在明确想清除所有卡片、
reflect run 和日志时才用 `--delete-library`。

## Spool（可选）

OME 可以接入 Spool CLI，把 Claude、Codex、Gemini 等多 Agent 历史统一索引。
不装不影响核心功能。交互式 `ome init` 只有在检测到 Spool CLI 时才询问是否启用；
如果没检测到，只展示这个以后安装的命令：

```bash
npm install -g @spool-lab/cli
```

OME 不会在首次设置中安装 Spool。脚本化 init（`-y`、dry-run）不会询问 Spool。
详见 [来源扫描](source-scan.md)。
