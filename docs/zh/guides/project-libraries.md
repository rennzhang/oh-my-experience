---
title: 全局与项目经验库
status: active
---

# 全局与项目经验库

OME 支持两层经验库：

- `dataDir` 配置的全局经验库；
- 项目根目录下可选的 `<project-root>/.oh-my-experience/`。

全局经验库是你的个人经验库。跨项目都适用的经验，或者不想写进某个仓库但仍想按项目
召回的经验，应该放在这里。

项目经验库属于仓库本身。只在这个项目里有意义的经验适合放这里，例如本项目的发版
规则、测试门槛、review 标准、迁移坑、团队约定。

## 初始化项目经验库

在项目目录里运行：

```bash
ome project init
```

OME 会创建：

```text
<project-root>/.oh-my-experience/
  README.md
  .gitignore
  experiences/
    draft/
    active/
    archived/
```

默认 `.gitignore` 会忽略 `events.jsonl`、`retrospectives/`、`indexes/` 等运行态文件。
如果希望项目自带自己的工作规则，提交 active 项目卡即可。

查看当前识别到的项目和项目库状态：

```bash
ome project status
```

## 写入项目卡

仍然走同一条复盘和草稿审批链路，只是告诉 Agent 这次经验要写入当前项目库：

```text
帮我把这次复盘出来的经验写入当前项目库。完成后只给我经验草稿审批；
等我确认入库后，再把通过的经验启用为项目经验。
```

除非是在做已确认过的手工迁移，否则不要直接往 `experiences/active/` 写文件。CLI 会把
candidate、draft、active、archived 的生命周期留在明面上，避免出现两套真相。

## 召回顺序

提示词进入 OME 时，会按当前工作目录处理：

1. 通过 `.git`、package 文件、`AGENTS.md`、`CLAUDE.md`、`.oh-my-experience` 等标记识别项目根目录。
2. 读取全局 `dataDir` 里的 active 卡。
3. 如果项目根目录存在 `.oh-my-experience/`，再读取项目库里的 active 卡。
4. 过滤 `scope` 与当前项目不匹配的卡。
5. 把剩余卡放在一起评分。
6. 折叠近似重复卡；同一条经验同时存在于全局和项目层时，优先展示项目卡。
7. 渲染注入上下文。项目卡会显示：

```bash
ome experience show CARD_ID --scope project --section rule
```

这和常见 agent 规则文件的分层思路接近：可以有全局层，也可以有项目层，项目层离当前
任务更近。但 OME 不是 rules 文件。`AGENTS.md`、`CLAUDE.md` 等适合放稳定、常驻、总是
要读的规则；OME 卡是条件提醒，只有当前任务匹配时才应该出现。

## 不侵入项目的召回方式

不需要给每个仓库都加 `.oh-my-experience/`。全局卡仍然可以通过
`scope.level: project` 或 `project-family` 按项目召回。这样所有存储都留在全局
`dataDir`，召回时仍然会先识别当前项目，再过滤不匹配的经验。

先查看 OME 会识别出的项目 key：

```bash
ome project status --cwd /path/to/project --json
```

如果是高级手工路径，也仍然走全局库生命周期，只是在经验草稿上声明项目适用范围：

```bash
ome reflect add <复盘编号> \
  --title "这个仓库的发版检查" \
  --summary "发布前必须跑本仓库的发版 gate。" \
  --rule "声称发版就绪前，先跑项目发版验证。" \
  --triggers "发版验证" \
  --scope-level project \
  --project-key "github.com/example/repo" \
  --module-path "."
```

内部候选文件也可以直接写同样的 `scope` 对象。这类卡仍保存在全局 `dataDir`，
但召回时会先按当前项目过滤，再进入评分。

经验应该跟仓库一起走时，用项目经验库。经验属于个人、涉及隐私，或暂时不适合进入仓库
时，用全局项目限定卡。
