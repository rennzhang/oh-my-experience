---
title: 安装配置指南
status: active
---

# 安装配置指南

首次使用优先阅读 [快速开始](quickstart.md)。本指南集中说明安装和配置细节。

## 安装

```bash
npm install -g oh-my-experience
ome init
```

也可以用 npx 不安装直接跑：

```bash
npx oh-my-experience init
```

`ome init` 引导你设置经验库路径（默认 `~/.oh-my-experience`），安装 Codex hook，
写入内置示例卡。

**让 Agent 帮你初始化：**

> 帮我完成 Oh My Experience 的初始化。运行 ome init，选择默认路径。完成后运行
> ome doctor 确认一切正常，再 ome hook status --provider codex 检查 hook 状态。

初始化完成后，把打印出来的第一段任务复制给 Agent，体验内置示例卡的回召效果。

后续可以重复运行 `ome init`。已经有经验库时，向导会沿用当前配置作为默认值。

## 脚本化初始化

非交互环境：

```bash
ome init -y --data-dir ~/.oh-my-experience
```

## 配置数据目录

可以改成任意本地路径，包括 Obsidian vault：

```bash
ome config preview dataDir ~/Obsidian/Oh-My-Experience   # 预览变更
ome config set dataDir ~/Obsidian/Oh-My-Experience       # 执行迁移
ome doctor                                                # 确认迁移成功
```

## 安装 Hook

```bash
ome hook status --provider codex     # 查看当前状态
ome init --provider claude            # 追加 Claude hook
ome init --provider all               # 两个都装
```

`ome init` 默认配置 Codex hook 并安装 OME skill。向导会在写入前展示 hook 文件
路径。

## 卸载

```bash
ome uninstall                         # 移除 hook，保留经验库
ome uninstall --provider all          # 移除所有 provider hook
ome uninstall --delete-library --yes  # 删除所有本地数据
```

默认卸载只移除 prompt-time 召回入口，经验库数据保留。只在明确想清除所有卡片、
reflect run 和日志时才用 `--delete-library`。

## Spool（可选）

OME 可以接入 Spool CLI，把 Claude、Codex、Gemini 等多 Agent 历史统一索引。
不装不影响核心功能。交互式 `ome init` 会在最后询问是否安装 Spool CLI：

```bash
npm install -g @spool-lab/cli
```

OME 不安装 Spool 桌面客户端。脚本化 init（`-y`、dry-run）不会询问 Spool。
详见 [导入源](import-sources.md)。