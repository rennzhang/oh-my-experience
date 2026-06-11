---
title: 评估指南
status: active
---

# 评估指南


## Recall Eval

```bash
ome eval recall --suite tests/fixtures/eval/core.json --limit 8 --threshold 40
```

修改 scoring logic 前应运行该命令。Recall eval 默认隔离：fixture cards 会加载到
临时 dataDir，不会进入你的真实经验库。

如果要有意评估当前 active library：

```bash
ome eval recall --suite my-suite.json --use-current-library
```

第一个质量 gate 不能只是“期望卡片出现了没有”。还要关注 `precisionAtK`、
`overRecallRate`、`noHitRate` 和 context size，因为过度召回最容易污染 hook
context。

## Hook Smoke

```bash
printf '{"prompt":"fix UI and validate in browser"}' | ome hook run --json
npm test
```

修改 provider adapters 或 hook runtime behavior 前应运行这些检查。fixture 检查
优先使用隔离 dataDir，provider-specific adapter 覆盖交给项目测试套件。
