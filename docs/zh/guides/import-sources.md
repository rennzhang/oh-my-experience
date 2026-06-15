---
title: 导入源
status: active
---

# 导入源


OME 只依赖 Codex 本地会话也可以启动。这样已经足够创建本地经验库，并验证提示词
阶段的经验召回。

Spool 是本机 AI 会话索引层，把 Claude、Codex、Gemini 等多 Agent 历史统一成
可搜索素材池。

不安装 Spool 时，OME 仍可从当前对话和显式导入的 Codex 会话取材，核心链路
完整；安装后，OME 可以先索引命中、再按需取证据，避免直接吞原始 session 导致
token 占用高、上下文变脏。推荐安装：多 Agent 用户覆盖更全，也能避开大量思考
过程和工具日志噪音。它是可选的，只是因为 OME 核心召回没有它也能工作。

## 为什么是可选

`ome init` 仍然先负责核心路径：创建本地经验库和安装 Agent 召回 hook。交互式
init 只会在核心设置成功之后，把 Spool 作为可选增强解释清楚，再询问用户。

因此 Spool 只在用户需要更广会话覆盖时使用。Codex 召回和本地经验库不依赖
Spool，脚本化 init 路径也不会安装它。

## Spool 带来的好处

- 让 reflect 扫描覆盖更多历史会话。
- 跨不同 Agent 和工作界面沉淀经验。
- 不改变 approval-first 生命周期：导入内容仍然先变成候选经验，不会直接进入 active。

## 检查是否可用

```bash
ome source status
```

如果本机已安装 Spool，OME 会显示检测到的版本。如果没有检测到，只安装 CLI 包后
再运行检查：

```bash
npm install -g @spool-lab/cli
```

OME 不安装 Spool 桌面客户端或 App。项目地址是
`https://github.com/spool-lab/spool`。

## 导入

```bash
ome source import spool --limit 50
```

等价命令：

```bash
ome import spool --limit 50
```

需要缩小范围时可以加过滤：

```bash
ome import spool --query "browser validation" --source codex
```

## 导入之后

让 Agent 在 reflect source audit 中纳入已导入记录，然后继续走正常审核
生命周期：

```bash
ome reflect start
ome reflect apply <run-id> --dry-run
ome reflect apply <run-id>
ome experience enable <draft-card-id>
```

导入材料不能绕过审核。Spool 只是扩大素材池，不改变 OME 的安全模型。
