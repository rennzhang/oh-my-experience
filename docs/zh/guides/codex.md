---
title: Codex 指南
status: active
---

# Codex 指南

Codex 是 OME 第一个支持的 Agent 平台，也是当前验证最充分的路径。

## Hook 安装

交互式设置里选择 `codex`，或者显式单独配置：

```bash
ome init --provider codex --dry-run   # 预览会写什么
ome init --provider codex             # 安装
ome hook status --provider codex      # 确认状态
```

Codex App 可能还需要在界面中手动信任 hook。

**让 Agent 帮你：**

```text
帮我安装 Oh My Experience 的 Codex hook。

1. 先运行 `ome init --provider codex --dry-run`，预览会写入哪些配置。
2. 如果预览没有风险，再运行 `ome init --provider codex`。
3. 最后运行 `ome hook status --provider codex`，确认 hook 已启用。

如果 Codex App 要求信任 hook，请停下来提醒我在界面里确认。
```

## 扫描 Codex 会话

```bash
ome source scan codex --sessions ~/.codex/sessions
```

**让 Agent 帮你：**

```text
帮我扫描 Codex 会话到 OME source index。

运行 `ome source scan codex --sessions ~/.codex/sessions`，然后告诉我索引了多少条、
跳过多少条，以及是否有解析失败的会话。
```

## 用 Codex Agent 做复盘

Codex Agent 可以独立完成整个 reflect 流程。

**完整复盘 prompt，复制使用：**

```text
帮我对最近编码会话做一次 OME reflect 复盘扫描。

1. 用 OME reflect 流程检查 ~/.codex/sessions 中的近期会话和当前对话。
2. 找到我纠正过你的地方（跳过验证、掩盖错误、混入无关改动等）。
3. 提炼 ≤5 条经验草稿，只保留以后能复用的执行判断。
4. 完成后只给我经验草稿审批链接和简短说明，不要让我看 JSON、内部文件或候选 schema。
5. 如果我继续补充想法、反例或修改意见，就优化同一次复盘，不要另开一轮。
6. 等我明确说“确认入库”后，再把通过的经验入库。

只提取真正能复用的执行判断。不要把一次性上下文写成经验卡。
```

## 验证召回

安装 hook 后，模拟一段 prompt 看效果：

```bash
echo '{"prompt": "修复登录页 UI 并在浏览器验证"}' | ome hook run
```

或者直接在 Codex 里发任务，看 Agent 提示词开头是否出现经验提醒。

## Skill

`ome init --provider codex` 会把 OME skill 安装到 Codex skills 目录。选择多个
Agent 时，OME 会给每个选中的 Agent 安装对应 skill。安装后 Agent 可以通过 skill
系统获得 recall、reflect、curate 和 troubleshoot 能力。
