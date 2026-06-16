---
title: 来源扫描
status: active
---

# 来源扫描

OME 的核心复盘链路默认使用 Codex 和 Claude 本地会话文件。这样已经足够创建本地
经验库，并做高质量证据审计，不需要依赖可选来源桥。

Spool 是本机 AI 会话索引层，把 Claude、Codex、Gemini 等多 Agent 历史统一成
可搜索素材池。

不安装 Spool 时，OME 仍可从 Codex/Claude 原生来源和当前对话取材，核心链路完整；
安装后，OME 可以把更多 provider 作为补充来源纳入。Spool 能提升额外 agent 覆盖，
但不是 Codex/Claude 合格深扫的前提。

## 干净存储模型

`ome source scan` 只写 pointer source index，不会把原始完整会话复制进 OME。

索引只保留来源路径、provider、时间、cwd、消息数量和 metadata hash。新的扫描默认
不写摘要。已有旧索引可以先预览再清理：

```bash
ome source clean
ome source clean --yes
```

第一条是 dry-run。第二条会清掉历史 summary 和 materialized session 标记。

## 原生用户证据索引

复盘前先构建临时 user-only 索引：

```bash
ome source user-index build --provider all --json
```

命令会输出 `indexPath`。Agent 后续用这个文件反复搜索和回读上下文：

```bash
ome source user-index search "browser validation" --index <file> --json
ome source user-index show <hit-id> --index <file> --context 4 --json
```

`user-index` 是给 Agent 用的证据工作台。它把用户消息放进临时索引文件，不更新长期
source index，也不会自动总结经验卡。query 展开、反例搜索、上下文回读和最终综合仍由
Agent 负责。

## 复盘时命中的经验卡

Agent 做复盘时，prompt-time recall 仍可能命中已有 OME 卡。这是正常的：流程治理卡可以
提醒 Agent 扫描要严谨、证据要回到原话、候选要停在审批阶段。

这些命中的旧卡不是新经验的来源证据。主题相关旧卡只能作为 active 卡重叠检查，判断新
结果应该保留、合并、改写还是拒绝。最终回复里的 used-card footer 只应列出本轮真正采用
的流程或治理卡，不应把主题旧卡列成“本次使用”。

## 没有 Spool

直接扫描 Codex 会话：

```bash
ome source scan codex --sessions ~/.codex/sessions
```

Agent 仍然必须把 focus lens 展开成多组短搜索：用户可能说过的原话、同义表达、
反向表达、验收标准、拒收理由、相关路径或模块名。

合格深扫优先走上面的原生 `user-index`。`source scan codex` 仍然是 pointer source
catalog 命令。

## Spool 作为补充来源

先检查并启用 Spool 来源：

```bash
ome source status
ome source connect spool --mode enabled
```

深扫前检查并刷新 Spool：

```bash
spool status
spool sync
```

优先 search-first 补充取证据：

```bash
spool search "browser validation" --source codex --limit 10 --json
spool show <uuid> --json
```

同一个 lens 要跑多条短 query，并在 retrospective audit 里记录 query 族。
`minimal intrusion no baggage` 这类单条 query 只能算一个探针，不能代表主题已经搜完。
Spool 命中只当额外线索；核心证据仍要尽量回到原生 user-only 索引和原始上下文。

然后只扫描高价值切片：

```bash
ome source scan spool --query "browser validation" --source codex --limit 50
```

不要用 architecture、fallback、source-of-truth 这类宽泛主题直接启动大范围 Spool
扫描。宽扫描容易命中超大会话并部分失败。应先缩 query、看命中，再把降级写入
retrospective audit。

如果某条高价值结果因为会话过大被跳过，可以显式提高限制：

```bash
ome source scan spool --query "browser validation" --max-session-bytes 4194304
```

## 扫描之后

让 Agent 在 reflect source audit 中纳入已扫描记录，然后继续走正常复盘和草稿审批流程：

```text
基于刚才扫描到的来源做 OME 复盘。完成后只给我经验草稿审批，不要让我看 JSON。
如果我继续补充意见，优化同一次复盘；等我确认入库后，再把通过的经验入库。
```

扫描材料不能绕过草稿审批和确认。Spool 只是扩大可搜索来源池，不改变 OME 的安全模型。
