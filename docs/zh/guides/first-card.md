---
title: 第一张经验卡
status: active
---

# 第一张经验卡

OME 真正有价值，是因为经验库里有你自己的真实纠正。经验卡应该从审阅过的复盘流程
进入系统，不要直接手写 active 卡。

## 1. 开始复盘

把这段话复制给 Agent：

```text
帮我创建一次 OME 复盘，目标是提炼一条可复用的编码经验：

1. 运行 `ome reflect start --focus "最近一次值得复用的编码纠正"`。
2. 深度扫描可访问的编码会话来源，找真实的用户纠正，不要只看最后几条消息。
3. 候选经验不要超过 3 条。
4. 只保留下次能改变 Agent 行动的经验。
```

`--focus` 是扫描镜头，不是捷径。除非你明确限制来源，否则 Agent 仍然应该围绕这个
关注点深度检查可访问的相关会话来源。

## 2. 写入候选

候选经验应该包含：

- 一句清晰的 `summary`，同时说明触发场景、失败模式、正确动作和边界；
- 自然语言 `use_when` 和 `ignore_when`；
- 聚焦的 `triggers` 和 `topics`；
- 只有稳定路由信号确实有用时才写 `engine_hints`；
- 放在 `rule` 里的完整可执行规则。

然后导入候选：

```bash
ome reflect candidates RUN_ID --from-file candidates.json
ome reflect show RUN_ID
```

## 3. 审阅后再启用

打开生成的 `retrospective.md`。重点看：

- 这个场景以后还会发生吗？
- Agent 下次看到这张卡，会改变行动吗？
- 它是否足够具体，能避免宽泛关键词误召回？
- 排除场景是否清楚？

记录决策：

```bash
ome reflect decide RUN_ID CANDIDATE_ID --action approve
ome reflect decide RUN_ID CANDIDATE_ID --action reject
ome reflect decide RUN_ID CANDIDATE_ID --action merge --target OTHER_ID
```

## 4. Apply 并启用

```bash
ome reflect apply RUN_ID --dry-run
ome reflect apply RUN_ID
ome experience enable DRAFT_ID
```

只有 active 卡会被 hook 召回。候选和 draft 不会进入 Agent prompt，直到你明确启用。

## 5. 验证召回

用一个真实的未来任务验证，不要照抄卡片原文：

```bash
ome match "一个相似的未来任务" --explain
```

结果应该足够精确。如果卡片命中过宽，先改卡片，不要继续加更多卡。
