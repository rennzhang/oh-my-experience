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

`dataDir` 是全局存储。项目级存储如果启用，则固定在项目旁边的
`<project-root>/.oh-my-experience/`，并根据当前工作目录发现。

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
`retrospectives/` 保存复盘与草稿审批工作区，`indexes/` 保存可重建的查询索引，
`events.jsonl` 是可选的追加事件流，用于 hook、operation、stats 和 eval 事件。

运行锁和安全备份放在操作系统临时目录下。它们是实现细节，不是经验库资产。

## 经验生命周期

```text
candidate -> draft -> active -> archived
```

- `candidate`：复盘生成的经验草稿。
- `draft`：用户接受经验草稿进入库，但还不会被召回。
- `active`：可以被召回的经验。
- `archived`：保留历史，但不参与召回。

只有 active 经验会被提示词阶段召回。

## 分类

分类是 candidate 和 experience 上的一等 metadata：

```text
retrospective extraction -> candidate.category -> draft.category -> active.category
```

CLI 接受复盘 candidate 上的 `category`，字段缺失时会推断一个。用户可以在 apply
reflect run 前覆盖候选分类。当前没有单独的 category registry 命令；新分类名称跟随
candidate 和 card 流转。`sources` 只保存证据和来源，不能作为分类传输通道。

## 来源信息

Active 卡片聚焦召回和使用判断，不再把原始来源、日期、`origin` 或
`sourceRefs` 作为核心卡片字段。来源信息保留在 retrospective run、operation log、备份和 source index 里。Matcher 使用 active 卡的 criteria、recall、scope 和 status。

## 来源索引

Session 扫描不会把完整 transcript 复制进 OME。扫描只向 `indexes/sources.json`
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

## 项目经验库布局

项目经验库使用同一套已确认卡片生命周期目录：

```text
<project-root>/.oh-my-experience/
  README.md
  .gitignore
  experiences/
    draft/
    active/
    archived/
```

项目提示词阶段召回会直接读取 `experiences/active/`，并把卡片标记为
`libraryScope: project`。项目库不需要自己的配置文件。默认 `.gitignore` 会忽略项目
`events.jsonl`、`retrospectives/` 和 `indexes/`；match 和 hook 召回不会写这些文件。
带 `--scope project` 的生命周期命令可能写入项目 retrospectives 和 events，因为用户
明确选择了创建或管理项目卡。

## 主题与适用范围

经验把“内容匹配”和“项目适配”分开：

- `topics`：经验所属的技术或工作流表面，例如 `frontend`、`git`、`runtime`、`review`
  或 `deployment`。
- `scope`：经验可在哪些地方被召回，级别包括 `global`、`project` 和
  `project-family`。

提示词阶段，运行时会根据当前工作目录、package metadata 和 Git remote 检测项目上下文，
然后在评分前过滤范围明确的经验。
