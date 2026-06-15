---
title: 评估体系
status: active
---

# 评估体系


## 目标

OME 当前提供本地评估体系，用于验证召回质量和 hook 运行时行为。两个已实现的
评估路径都不调用 AI model。

## Recall Eval

输入：

- card fixture set；
- prompt fixture set；
- expected relevant cards；
- expected non-relevant cards。

隔离规则：

- recall eval 默认使用临时 dataDir 中的 fixture cards；
- fixture cards 绝不能写入用户真实经验库；
- 评估 active local library 必须显式传入 `--use-current-library`。

指标：

- recall@k；
- precision@k；
- MRR；
- nDCG；
- false-positive rate；
- no-hit rate；
- over-recall rate；
- latency；
- injected context size。

命令：

```bash
ome eval recall --suite <suite.json>
ome eval recall --suite <suite.json> --limit 4 --threshold 40 --min-pass-rate 1 --min-recall 1 --min-precision 1 --max-over-recall 0
ome eval recall --compare before.json after.json
```

`ome eval recall` 读取 [Evaluation Fixtures](../reference/eval-fixtures.md)
里的 suite 结构，seed 隔离 fixture dataDir，并报告质量指标；它不会修改用户的
runtime hook 配置。

## Hook Eval

输入：

- Codex hook stdin fixture；
- Claude hook stdin fixture；
- dataDir fixture。

检查：

- normalized event 是否正确；
- output schema 是否符合 provider；
- 默认不保存 raw prompt；
- fixture card 命中时 additional context 是否存在；
- 匹配到的经验卡链接是否存在，以及最终只披露实际使用卡片的说明是否清楚；
- hook logs 是否包含 recall evidence。

运行时验证路径：

```bash
printf '{"prompt":"fix UI and validate in browser"}' | ome hook run --json
npm test
```

Hook runtime 覆盖应使用隔离 fixture 数据、真实 `ome hook run` 和 provider adapter
测试，并检查 output schema、matched-card evidence、候选卡链接、最终使用披露说明、prompt hashing 和
raw-prompt privacy。它不应安装 hooks，也不应触碰用户配置的 dataDir。
