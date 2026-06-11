---
title: Codex 指南
status: active
---

# Codex 指南

Codex 是 OME 第一个支持的 Agent 平台。

## Hook 安装

`ome init` 默认会安装 Codex hook。如果已经初始化过，单独配置：

```bash
ome init --provider codex --dry-run   # 预览会写什么
ome init --provider codex             # 安装
ome hook status --provider codex      # 确认状态
```

Codex App 可能还需要在界面中手动信任 hook。

**让 Agent 帮你：**

> 帮我安装 Oh My Experience 的 Codex hook。先 ome init --provider codex --dry-run
> 预览，确认无误后 ome init --provider codex，最后 ome hook status 确认。

## 导入 Codex 会话

```bash
ome import codex --sessions ~/.codex/sessions
```

**让 Agent 帮你：**

> 帮我导入 Codex 会话到 OME。运行 ome import codex --sessions ~/.codex/sessions，
> 告诉我导入了多少条、跳过多少条。

## 用 Codex Agent 做复盘

Codex Agent 可以独立完成整个 reflect 流程。

**完整复盘 prompt，复制使用：**

```
帮我对最近编码会话做一次 OME reflect 复盘扫描。

1. 先 ome reflect start --focus "最近纠正过的执行错误"
2. 检查 ~/.codex/sessions 中的近期会话和当前对话
3. 找到我纠正过你的地方（跳过验证、掩盖错误、混入无关改动等）
4. 生成 ≤5 条候选经验，每条包含：问题、反模式、正确做法、触发条件、抑制条件
5. 写入候选文件后 ome reflect candidates RUN_ID --from-file FILE
6. ome reflect show RUN_ID 展示，等我逐条审批

只提取真正能复用的执行判断。不要把一次性上下文写成经验卡。
```

## 验证召回

安装 hook 后，模拟一段 prompt 看效果：

```bash
echo '{"prompt": "修复登录页 UI 并在浏览器验证"}' | ome hook run
```

或者直接在 Codex 里发任务，看 Agent 提示词开头是否出现经验提醒。

## Skill

`ome init` 会自动把 OME skill 安装到 Codex skills 目录。安装后 Agent 可以通过
skill 系统获得 recall、reflect、curate 和 troubleshoot 能力。