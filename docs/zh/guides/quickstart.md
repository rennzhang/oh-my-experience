---
title: 快速开始
status: active
---

# 快速开始

本指南带你从零到第一次体验召回。整个过程大部分操作由 AI Agent 代劳——你只需
复制粘贴提示词。

## 1. 安装（你自己来）

```bash
npm install -g oh-my-experience
```

## 2. 初始化（让 Agent 来）

把这段话复制给你的 Agent（Codex 或 Claude）：

> 帮我完成 Oh My Experience 的初始化设置：
>
> 1. 运行 `ome init`，选择默认路径
> 2. 运行 `ome doctor`，确认一切正常
> 3. 运行 `ome hook status --provider codex`，确认 hook 已安装
>
> 把每一步的诊断结果告诉我。

初始化完成后，经验库里会自带几条内置示例卡。你可以先用它们体验召回效果，之后
觉得不合适再删（`ome starter remove --yes`）或归档。

## 3. 体验召回（让 Agent 模拟）

把这段话复制给 Agent：

> 用 ome match 测试一下召回效果：
>
> ```
> ome match "修复登录页面 UI，在浏览器里验证效果" --explain
> ```
>
> 告诉我命中了哪些经验卡、为什么命中、会注入什么额外上下文。

`--explain` 会展示检测到的任务信号、每张卡的评分原因、相似卡片，以及最终渲染的
注入上下文。如果命中结果不符合预期，就说明需要调整卡片的触发条件。

## 4. 做第一次复盘扫描

现在让 Agent 对你最近的编码会话做一次经验扫描。把这段话复制给 Agent：

> 帮我对最近的编码会话做一次 OME 复盘扫描。步骤：
>
> 1. 运行 `ome reflect start --focus "最近纠正过的错误模式"`
> 2. 浏览最近会话中我纠正过你的地方（你做得不对、我让你改的地方）
> 3. 生成候选经验卡。每条必须包含：
>    - 问题：上次哪里翻车了
>    - 反模式：要避免的做法
>    - 正确做法：应该怎么做
>    - 触发条件：什么任务该召回这条经验
> 4. 候选写入候选文件后，运行 `ome reflect candidates RUN_ID --from-file FILE` 导入
> 5. 运行 `ome reflect show RUN_ID` 展示所有候选
>
> 候选不要超过 5 条。只提取真正能复用的执行判断，不要把一次性的上下文写成规则。

Agent 展示候选后，你逐条审核。

## 5. 审核候选经验

审核时问自己：这条经验以后还会遇到吗？下次 Agent 看到它，能避免犯同样的错吗？

如果觉得有用：

> 帮我 apply 这些候选。运行 `ome reflect apply RUN_ID --dry-run` 先预览，确认
> 无误后运行 `ome reflect apply RUN_ID`，然后 `ome experience promote DRAFT_ID`
> 把 draft 晋升为 active。

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

## 6. 验证新经验生效

审核完成后，用一个真实任务验证：

> 用 ome match 验证一下刚入库的经验卡是否会被正确召回。模拟一段跟刚才翻车场景
> 类似的任务描述，看新卡有没有命中。

```bash
ome match "你的任务描述" --explain
```

## 7. 持续迭代

之后每次发 prompt，hook 会自动匹配相关经验。想看看经验库的整体健康状况：

> 帮我跑 ome stats，看看经验库的召回覆盖率、哪些卡长期没命中、有没有 stale card。

如果召回噪音大，优先改进卡片而不是关掉系统：

- 收窄触发条件，加更具体的 triggers
- 为歧义词加 negative triggers
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
| 看候选 | `ome reflect show RUN_ID` |
| 预览 apply | `ome reflect apply RUN_ID --dry-run` |
| 正式 apply | `ome reflect apply RUN_ID` |
| 批准卡片 | `ome experience promote DRAFT_ID` |
| 归档卡片 | `ome experience archive CARD_ID` |