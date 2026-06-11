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
      "triggers": ["browser validation", "浏览器验证"],
      "topics": ["frontend", "test"],
      "applicability": { "level": "global" },
      "recallPolicy": "must",
      "body": "Open the real browser after UI changes."
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
