---
title: 评估 Fixture
status: active
---

# 评估 Fixture


本页只记录当前已实现的 recall eval fixture 结构。

## Recall Suite

```json
{
  "name": "core",
  "experiencesFile": "./core.cards.json",
  "cases": [
    {
      "id": "frontend-browser-validation",
      "difficulty": "easy",
      "prompt": "修复 UI 后请在浏览器里验证",
      "expectedCards": ["browser-validation"],
      "allowedExtraCards": [],
      "unexpectedCards": ["git-commit-safety"],
      "tags": ["frontend", "zh-CN"]
    },
    {
      "id": "docs-only-no-hit",
      "difficulty": "hard",
      "prompt": "只解释这个文档示例，不要执行",
      "expectedCards": [],
      "expectNoMatches": true,
      "tags": ["negative", "held-out"]
    }
  ]
}
```

Experience fixture file：

```json
{
  "experiences": [
    {
      "id": "browser-validation",
      "status": "active",
      "title": "Browser Validation",
      "category": "测试验收",
      "summary": "UI 改动需要真实浏览器验证，纯后端或纯文档任务不应召回这张卡。",
      "criteria": {
        "use_when": ["frontend visible change", "real browser validation"],
        "ignore_when": ["backend-only migration", "documentation-only example"]
      },
      "engine_hints": {
        "positive": ["UI browser validation"],
        "negative": ["backend-only migration"]
      },
      "recall": {
        "policy": "must",
        "risk": "high",
        "confidence": "high",
        "triggers": ["browser validation", "浏览器验证"],
        "topics": ["frontend", "test"]
      },
      "scope": { "level": "global" },
      "rule": "Open the real browser after UI changes."
    }
  ]
}
```

运行：

```bash
ome eval recall --suite <suite.json>
```

Recall suite 是确定性的，不调用 AI model。

默认行为是隔离的。Fixture experiences 会写入临时 dataDir，不会进入用户真实经验库，
也不会影响真实 hook 行为。

## 公开 Fixture 隐私边界

提交到公共仓库的 fixture 必须是合成、最小化的复现场景。测试所需的召回边界要保留，
但真实 prompt 措辞、用户或组织名称、本地路径、项目标识、session ID 及其他可追溯值
必须替换。原始 prompt 和完整生产日志回放只能放在仓库外的私有评测集中。

## Case Contract

- `expectedCards`：列出的卡片必须全部返回。
- `unexpectedCards`：明确禁止返回的结果。
- `allowedExtraCards`：只有这里列出的未预期结果可以出现而不让 case 失败；严格
  precision 场景应省略或使用空数组。
- `expectNoMatches`：要求 abstention，任何返回结果都会让 case 失败。
- `difficulty` 和 `tags`：只用于报告，不改变 retrieval 行为。
- `threshold`：可选的 case-level threshold override。
- `cwd`：可选 project context，用于验证 scoped cards。

默认情况下，未判定的 extra card 会让 case 失败。这样可以避免“找到了 expected card，
同时注入了无关 context”却仍被报告为成功。

No-hit cases 会进入 precision、no-hit 和 over-recall 行为统计，但不进入 MRR 与 nDCG，
因为它们没有 relevant item 可以排序。

## Suite 设计

Core suite 是 regression gate，但单独通过它不够。新的 retrieval 行为还应覆盖：

- 不依赖私有或产品专用 hard signal 的 held-out prompts/cards；
- 与目标卡有可信 lexical overlap 的 noisy decoys；
- 添加无关卡片后 bounded evidence score 与 threshold decision 不变的
  scale/invariance tests；
- exact `ignore_when` rejection、长 prompts、mixed intent、dynamic top-k、
  abstention，以及 global/project duplicate preference 等边界。

保存 report 后可以比较：

```bash
ome eval recall --compare before.json after.json
```

Compare 遇到 quality-metric regression，或 case 从 pass 变 fail 时会 fail closed。
