---
title: 快速开始
status: active
---

# 快速开始

本指南带你完成第一次安装、初始化和召回验证。需要你亲自执行的只有 CLI 安装；
其余步骤可以直接复制提示词，让 Codex 或 Claude 代你运行并解释结果。

## 1. 安装 CLI

```bash
npm install -g oh-my-experience
```

这条命令把 `ome` 安装成全局命令，之后任何终端或 Agent 都可以直接运行
`ome init`、`ome doctor` 和 `ome match`。如果你不想全局安装，可以在
[安装配置指南](setup.md) 里使用 `npx` 路径。

## 2. 初始化经验库

把这段话复制给你的 Agent（Codex 或 Claude）：

```text
帮我完成 Oh My Experience 的初始化设置：

1. 运行 `ome init`，选择默认经验库路径。
2. 运行 `ome doctor`，确认经验库、配置和 hook 状态正常。
3. 运行 `ome hook status --provider codex`，确认 Codex hook 已安装。

把每一步的结果和任何需要我确认的风险告诉我。
```

初始化完成后，经验库里会自带几条内置示例卡。你可以先用它们体验召回效果；之后
不需要某张示例卡时，用正常经验库治理方式归档：
`ome experience archive <starter-card-id> --reason "不再需要"`。

## 3. 验证召回效果

把这段话复制给 Agent：

```text
用 `ome match` 测试一次召回效果：

ome match "修复登录页面 UI，在浏览器里验证效果" --explain

告诉我命中了哪些经验卡、为什么命中、以及会注入什么额外上下文。
```

`--explain` 会展示检测到的任务信号、每张卡的评分原因、相似卡片，以及最终渲染的
注入上下文。如果命中结果不符合预期，就说明需要调整卡片的触发条件。

## 4. 可选：添加项目经验库

只有当仓库需要携带自己的已审阅经验时才做这一步：

```bash
cd /path/to/your/project
ome project init
ome project status
```

`dataDir` 仍然是全局经验库。项目经验库固定在
`<project-root>/.oh-my-experience/`。任务在这个项目里运行时，OME 会同时读取两层；
同一条经验同时存在于全局和项目层时，优先展示项目卡。完整模型见
[全局与项目经验库](project-libraries.md)。

## 5. 做第一次复盘扫描

现在让 Agent 对你最近的编码会话做一次经验扫描。把这段话复制给 Agent：

```text
帮我对最近的编码会话做一次 OME 复盘扫描。步骤：

1. 运行 `ome reflect start --focus "最近纠正过的错误模式"`。
2. 浏览最近会话中我纠正过你的地方，也就是你做得不对、我要求返工的地方。
3. 按 当前候选 JSON 生成 `candidates.json`：
   - `audit`：来源覆盖、搜索过的来源、排除过的误解和证据缺口
   - `candidates[].summary`：一句话说清失败模式、适用场景、排除场景和期望动作
   - `candidates[].criteria.use_when` / `ignore_when`：自然语言使用标准
   - `candidates[].recall.policy/risk/confidence/triggers/topics`
   - `candidates[].engine_hints`：只有确实需要内部信号时才写
   - `candidates[].scope`
   - `candidates[].rule`：完整可执行规则
4. 运行 `ome reflect candidates RUN_ID --from-file candidates.json` 导入。
5. 运行 `ome reflect show RUN_ID` 展示所有候选。

候选不要超过 5 条。只提取真正能复用的执行判断，不要把一次性上下文写成规则。
```

Agent 展示候选后，你逐条审核。

## 6. 审核候选经验

审核时问自己：这条经验以后还会遇到吗？下次 Agent 看到它，能避免犯同样的错吗？

如果觉得有用：

```text
帮我 apply 这些候选：

1. 运行 `ome reflect apply RUN_ID --dry-run` 先预览将要写入的 draft。
2. 确认无误后运行 `ome reflect apply RUN_ID`。
3. 对需要启用的 draft，运行 `ome experience promote DRAFT_ID`，把它晋升为 active。
```

如果某条候选太模糊、不通用、或者已经覆盖了，reject 掉：

```bash
ome reflect decide <run-id> <candidate-id> --action reject
```

如果两条差不多，merge：

```bash
ome reflect decide <run-id> <candidate-id> --action merge --target <other-id>
```

只有 active 状态的卡片会被 hook 召回。未经你批准的候选永远不会出现在 Agent 的
提示词里。

## 7. 验证新经验生效

审核完成后，用一个真实任务验证：

```text
用 `ome match` 验证刚入库的经验卡是否会被正确召回。
模拟一段跟刚才翻车场景类似的任务描述，看新卡有没有命中。
```

```bash
ome match "你的任务描述" --explain
```

## 8. 持续迭代

之后每次发 prompt，hook 会自动匹配相关经验。想看看经验库的整体健康状况：

```text
帮我运行 `ome stats`。
请重点看经验库的召回覆盖率、哪些卡长期没命中、有没有 stale card。
```

如果召回噪音大，优先改进卡片而不是关掉系统：

- 收窄 `criteria.use_when` 和 `recall.triggers`
- 为歧义词加 `criteria.ignore_when`
- 限制项目适用范围
- 合并相似卡片
- 归档长期未命中的卡

---

## 快速参考

让 Agent 帮你做这些事时的常用命令：

| 我想... | 给 Agent 的命令 |
|---------|---------------|
| 测召回 | `ome match "任务描述" --explain` |
| 看状态 | `ome doctor` |
| 看统计 | `ome stats` |
| 开始复盘 | `ome reflect start --focus "关注方向"` |
| 初始化项目库 | `ome project init` |
| 看候选 | `ome reflect show RUN_ID` |
| 预览 apply | `ome reflect apply RUN_ID --dry-run` |
| 正式 apply | `ome reflect apply RUN_ID` |
| 批准卡片 | `ome experience promote DRAFT_ID` |
| 归档卡片 | `ome experience archive CARD_ID` |
