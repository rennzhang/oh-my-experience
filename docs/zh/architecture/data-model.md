---
title: 数据模型
status: active
---

# 数据模型


## 数据目录

默认数据目录：

```text
~/.oh-my-experience
```

用户可以把数据目录指向其他本地路径，包括 Obsidian 的某个子目录。OME 应使用专用
子目录，而不是直接写入整个 vault 根目录。

## 目录布局

```text
config.json
experiences/
  draft/
  active/
  archived/
retrospectives/
indexes/
  experiences.json
  categories.json
  sources.json
events.jsonl
```

数据目录只有一条可见存储模型。`experiences/` 保存审核后的经验文件，
`retrospectives/` 保存复盘审批工作区，`indexes/` 保存可重建的查询索引，
`events.jsonl` 是可选的追加事件流，用于 hook、operation、stats 和 eval 事件。

运行锁和安全备份放在操作系统临时目录下。它们是实现细节，不是经验库资产。

## 经验生命周期

```text
candidate -> draft -> active -> archived
```

- `candidate`：复盘生成的候选经验。
- `draft`：用户接受候选经验进入库，但还不会被召回。
- `active`：可以被召回的经验。
- `archived`：保留历史，但不参与召回。

只有 active 经验会被提示词阶段召回。

## 分类

分类是 candidate 和 experience 上的一等 metadata：

```text
retrospective extraction -> candidate.category -> draft.category -> active.category
```

CLI 接受复盘 candidate 上的 `category`，字段缺失时会推断一个。用户可以创建分类，
并在 apply reflect run 前覆盖候选分类。`sources` 只保存证据和来源，不能作为分类
传输通道。

## 来源信息

经验和候选经验同时保留人类可读来源和结构化来源：

- `sources`：简短展示/证据字符串。
- `origin`：source adapter、agent 家族、可选 model/session/project，以及条目来自
  reflect run、starter lesson、import 还是 manual entry。
- `sourceRefs`：指向 session、turn、file、retrospective、starter lesson 或 manual
  source 的结构化引用。

Matcher 当前把 provenance 用作证据和诊断信息。召回资格由经验状态和适用范围控制。

## 来源索引

Session 导入不会把完整 transcript 复制进 OME。导入只向 `indexes/sources.json`
写入紧凑来源指针：

- `id`
- `provider`
- `sourcePath`
- `startedAt`
- `cwd`
- `summary`
- `metadataHash`
- `messageCount`

来源索引不能内嵌完整消息正文。核心维护流程会重建它，并剥离任何意外残留的
`messages` payload。

运行配置包含 session 保留姿态：

```json
{
  "sessions": {
    "store": "pointer",
    "retainDays": 30,
    "keepAppliedEvidence": true
  }
}
```

- `pointer`：默认姿态。保留来源指针和轻量 metadata。
- `recent`：为 source-aware workflow 预留的保留姿态。
- `full`：为明确的离线迁移 workflow 预留的保留姿态。

来源索引重写是内部维护操作。标准布局里不再有物化 session 目录。

提示词阶段召回不能依赖 session 正文；它只依赖 active experiences 和
`indexes/experiences.json`。

## 主题与适用范围

经验把“内容匹配”和“项目适配”分开：

- `topics`：经验所属的技术或工作流表面，例如 `frontend`、`git`、`runtime`、`review`
  或 `deployment`。
- `applicability`：经验可在哪些地方被召回，级别包括 `global`、`project` 和
  `project-family`。

提示词阶段，运行时会根据当前工作目录、package metadata 和 Git remote 检测项目上下文，
然后在评分前过滤范围明确的经验。
