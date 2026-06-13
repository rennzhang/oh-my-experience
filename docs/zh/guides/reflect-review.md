---
title: 复盘与审阅
type: guide
priority: high
---

# 复盘与审阅

OME 的核心价值在于：把你纠正 Agent 的真实经验，沉淀为可复用的经验卡。

这个过程叫 reflect（复盘）。Agent 扫描会话中你纠正过它的地方，生成候选经验卡，
你审核后决定哪些入库。入库的 active 卡会在之后同类任务中自动召回。

```text
真实工作 → 复盘扫描 → 候选经验 → 你审核 → draft → active → prompt-time 自动召回
```

## 什么时候做复盘

不需要每次对话都做。适合的时机：

- 你纠正了 Agent 2-3 次同类错误
- Agent 又犯了一个你已经纠正过的错（说明该入库了）
- 完成一个重要阶段，想做一次回顾
- `ome stats` 显示很多 prompt 没有命中任何经验（说明缺卡）

## 做一次复盘

### 步骤 1：发起扫描

把这段话复制给 Agent：

```text
帮我对最近编码会话做一次 OME reflect 复盘扫描。步骤：

1. 运行 `ome reflect start --focus "最近纠正过的执行错误"`。
2. 浏览近期会话中我纠正过你的地方，重点关注：
   - 你跳过了某个验证步骤（比如没跑浏览器、没做测试）
   - 你用 fallback 或静默处理掩盖了错误
   - 你混入了无关改动
   - 你忘记了某个项目特有的流程
3. 生成候选经验卡，写入临时文件。
4. 运行 `ome reflect candidates RUN_ID --from-file FILE` 导入。
5. 运行 `ome reflect show RUN_ID` 展示所有候选。
```

### 指定关注方向

如果你已经有明确想沉淀的经验，加 `--focus`：

```bash
ome reflect start --focus "浏览器验证和交付前检查"
ome reflect start --focus "Git 提交规范和 PR 流程"
ome reflect start --focus "TypeScript 类型安全和错误处理"
```

`--focus` 不是过滤条件，而是告诉 Agent 扫描时的侧重点。Agent 还是会检查所有
可访问的会话来源，只是聚焦分析指定方向。

### 候选经验卡长什么样

Agent 生成的每条候选必须包含：

| 字段 | 说明 | 示例 |
|------|------|------|
| `summary` | 一句话说清失败模式、适用场景、排除场景和期望动作 | UI 改动需要真实浏览器验证，纯后端或纯文档任务不应召回 |
| `criteria.use_when` | 模型什么时候应该用这张卡的自然语言标准 | UI 修改、前端修复、页面样式调整 |
| `criteria.ignore_when` | 近似但不该使用的场景 | 纯后端改动、数据库迁移、文档示例 |
| `recall.triggers` | matcher 使用的短锚点，通常从 `use_when` 里选 3-5 条 | 浏览器验证、UI 验收 |
| `recall.topics` | 用于解释和加权的宽泛表面 | frontend、browser |
| `scope` | 卡片可在哪些地方召回 | `{ "level": "global" }` |
| `rule` | Agent 判断适用后读取的完整执行规则 | 启动真实浏览器、检查响应式、交互、loading、error 和控制台 |

**好的经验卡**：一句话行为修正，触发条件精确，能在未来任务中被准确召回。
**差的候选**：太泛（"重视代码质量"）、太窄（只针对上一次的某个文件）、没给 Agent 可执行的动作。

### 步骤 2：逐条审核

Agent 展示候选后，你逐条决定。

把这段话复制给 Agent：

```text
帮我展示 `RUN_ID` 的所有候选经验。一条一条来，每条给我看：

- summary
- 使用标准
- 忽略标准
- 完整规则

然后问我是 approve、reject、merge 还是 rewrite。
```

审批时问自己三个问题：
1. 这条经验以后还会遇到吗？
2. 下次 Agent 看到它，能避免犯同样的错吗？
3. 使用标准和忽略标准够精确吗？会不会误触发？

### 步骤 3：入库

对每条候选做出决定后，让 Agent 应用结果：

```text
帮我执行审核结果：

1. 运行 `ome reflect apply RUN_ID --dry-run` 预览将要写入的 draft。
2. 确认无误后运行 `ome reflect apply RUN_ID`。
3. 对需要设为 active 的卡片，逐个运行 `ome experience promote DRAFT_ID`。
```

入库是两步设计，apply 之后卡片是 draft 状态，promote 之后才是 active。中间
你可以随时检查和修改 draft。

### 步骤 4：验证

入库完成后立即验证：

```text
用 `ome match` 验证刚入库的经验卡。
模拟一段跟刚才翻车场景类似的任务描述，看新卡会不会命中。

ome match "一段任务描述" --explain
```

## 审核决策参考

| 操作 | 什么时候用 | 命令 |
|------|-----------|------|
| approve | 这条经验可复用、使用标准和忽略标准精确 | `ome reflect decide RUN_ID CANDIDATE_ID --action approve` |
| reject | 太模糊、一次性、或已被覆盖 | `ome reflect decide RUN_ID CANDIDATE_ID --action reject` |
| merge | 和另一条候选高度相似，合并 | `ome reflect decide RUN_ID CANDIDATE_ID --action merge --target OTHER_ID` |
| rewrite | 方向对但表达不好，重写 | 直接在候选文件里改，然后重新导入 |

## 保持经验库健康

经验库不是越多越好。几条长期建议：

- **宁可少而精。** 10 条精准召回的经验卡，比 50 条模糊规则更有用。
- **定期看 stats。** `ome stats` 看哪些卡长期没命中，考虑归档。
- **查重。** 如果你 approve 新卡后感觉和旧卡差不多，合并它们。
- **修正误触发。** 如果某张卡经常在不相关的任务中被召回，收紧 `criteria.ignore_when`、`recall.triggers`、topics 或 scope。

---

## 给 Agent 的一键复盘 prompt（模板）

以后每次想做复盘，直接用这段：

```text
帮我对最近 [时间段 / 项目名] 的编码会话做一次 OME reflect 复盘扫描。

步骤：
1. ome reflect start --focus "[关注方向]"
2. 浏览会话中我纠正过你的地方，生成 ≤5 条候选经验
3. 候选写入文件后 ome reflect candidates RUN_ID --from-file FILE
4. ome reflect show RUN_ID 展示所有候选
5. 逐条等我 approve/reject/merge/rewrite 决定

每条候选必须使用 当前 OME 候选 JSON：包含 audit，以及 summary、criteria、recall、scope、rule；只有确实需要内部召回信号时才写 engine_hints。
只提取真正能复用的执行判断，不要一次性的上下文。
```
