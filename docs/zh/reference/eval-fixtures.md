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
      "unexpectedCards": ["git-commit-safety"],
      "tags": ["frontend", "zh-CN"]
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
