---
title: 来源扫描
status: active
---

# 来源扫描

OME 只依赖 Codex 本地会话也可以启动。这样已经足够创建本地经验库，并验证提示词
阶段的经验召回。

Spool 是本机 AI 会话索引层，把 Claude、Codex、Gemini 等多 Agent 历史统一成
可搜索素材池。

不安装 Spool 时，OME 仍可从当前对话和显式扫描的 Codex 会话取材，核心链路
完整；安装后，OME 可以先索引命中、再按需取证据，避免直接吞原始 session 导致
token 占用高、上下文变脏。多 Agent 用户建议启用：覆盖更全，也能避开大量思考
过程和工具日志噪音。

## 干净存储模型

`ome source scan` 只写 pointer source index，不会把原始完整会话复制进 OME。

索引只保留来源路径、provider、时间、cwd、消息数量和 metadata hash。新的扫描默认
不写摘要。已有旧索引可以先预览再清理：

```bash
ome source clean
ome source clean --yes
```

第一条是 dry-run。第二条会清掉历史 summary 和 materialized session 标记。

## 没有 Spool

直接扫描 Codex 会话：

```bash
ome source scan codex --sessions ~/.codex/sessions
```

Agent 仍然必须把 focus lens 展开成多组短搜索：用户可能说过的原话、同义表达、
反向表达、验收标准、拒收理由、相关路径或模块名。

## 有 Spool

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

优先 search-first 取证据：

```bash
spool search "browser validation" --source codex --limit 10 --json
spool show <uuid> --json
```

同一个 lens 要跑多条短 query，并在 retrospective audit 里记录 query 族。
`minimal intrusion no baggage` 这类单条 query 只能算一个探针，不能代表主题已经搜完。

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
