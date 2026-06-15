---
title: 架构总览
status: active
---

# 架构总览


## 模块边界

```text
packages/core            data model, cards, retrospectives, matcher, retrieval, stats, doctor
packages/cli             command parsing and user-facing command flow
packages/adapters/agents/codex
                         Codex hook setup/status adapter
packages/adapters/agents/claude
                         Claude hook setup/status adapter
packages/adapters/sources/codex-sessions
                         Codex local session scan
packages/adapters/sources/spool
                         optional official Spool discovery and source scanning
packages/hook-runtime    hot-path recall runtime for agent hooks
skills/oh-my-experience  agent workflow instructions
templates/               card template
examples/                sample cards and workflows
docs/                    current guides, architecture, and reference
```

## 依赖规则

Core 拥有业务真相。其他模块可以调用 core，但 core 不能依赖 CLI、provider adapters 或 hook runtime。

```text
CLI -> core/adapters/hook-runtime
hook-runtime -> core
provider adapters -> core schemas
skill -> CLI
```

`packages/core/src/matcher.ts` 负责 prompt decomposition、tokenization、query variants 和 query plans。`packages/core/src/retrieval.ts` 负责 active-card index 读取、scoring、diversification 和 context rendering。这个拆分让用户提示词理解层可以独立测试和调优。

项目用 TypeScript 编写，并以 built ESM 形式发布到 `dist/`。npm 包默认不包含 Bun standalone binary；Bun binary 输出在 `build/ome` 下单独生成，用于 release asset 验证。

## 运行时规则

Hook runtime 必须快速且 fail-open：

- 不调用 LLM；
- 不访问网络；
- 不扫描会话；
- 不写 active card；
- 严格超时；
- additional context 有明确预算。

慢工作属于 reflect、curation、eval 或 maintenance commands。

## 存储规则

所有持久化写入必须通过 core storage helpers。Provider adapters 和 hooks 不能直接修改卡片文件。

## Provider 规则

Provider 差异放在边缘：

- hook input parsing；
- hook output shape；
- hook setup/status paths；
- session scan formats。

Retrieval、scoring、context budgeting、stats 和 card lifecycle 必须保持 provider-neutral。
