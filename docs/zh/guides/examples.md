---
title: 实际案例
status: active
---

# 实际案例

理解 OME 最快的方式，是看一次真实的 prompt-time recall。这个案例用
`/goal` / `创建目标` 做例子，因为它能说明 OME 和常驻规则文件的核心区别：
不是把所有要求都塞进入口规则，而是在任务真的需要时召回对应经验。

## 案例：`/goal` 触发完整闭环交付模式

假设你的 active 经验库里有一张已经审核过的目标执行卡：
`创建目标时进入完整闭环交付模式`。它的使用标准是：当 `/goal`、`创建目标` 或
`开干` 启动真实执行任务时使用；如果只是文档示例、功能解释或业务目标讨论，就忽略。

当用户发出：

```text
创建目标，开干，把这个功能完整做完并自己验证
```

OME 会先把这段 prompt 拆成 task envelope。它会识别出 goal 执行意图、明确执行意图、
真实验证要求，然后把这张卡列为 high-risk、must-use 的候选经验。候选不等于已经使用；
Agent 还要根据这张卡的工作流含义判断它是否真的适用于当前任务，再读取并应用完整规则。

## 实际压入 Agent Prompt 的内容

Hook 压入的是一个紧凑的 additional context。外层框架固定使用英文，保证 Codex 和
Claude 收到稳定结构；经验卡自己的正文保持原语言。

```text
OME candidate experience cards. Matched does not mean used: apply a card only when its workflow meaning fits the current task; ignore unrelated or conflicting cards.
Final report: if you actually used any card, add one final line `**本次使用 N条 OME 经验卡：** ...` using only the `Final link if used` values for cards you applied; omit the line if none applied.
1. [high risk][must] 创建目标时进入完整闭环交付模式 (创建目标时进入完整闭环交付模式-40383753)
   Summary: 当用户用 /goal、创建目标或开干启动真实长任务时，常见误判是只建目标或做局部切片；应进入完整闭环交付，并排除文档示例、概念解释和业务目标讨论。
   Scope: global
   Use if: /goal 开始执行; 创建目标开干; 使用 goal 跑长任务
   Ignore if: 文档或案例里展示 /goal; 解释 goal 功能但不执行
   Matched by: task looks like a real goal-execution start
   Rule: ome experience show 创建目标时进入完整闭环交付模式-40383753 --section rule
   Final link if used: [创建目标时进入完整闭环交付模式](<~/.oh-my-experience/experiences/active/创建目标时进入完整闭环交付模式-40383753.md>)
```

链接里的路径来自用户自己的经验库。全局库会指向用户配置的 `dataDir`；项目库会指向
`<project-root>/.oh-my-experience/`。

## Agent 接下来读取的完整规则

为了控制 prompt 体积，hook 先注入候选上下文。Agent 判断这张卡适用后，再读取完整规则：

```bash
ome experience show 创建目标时进入完整闭环交付模式-40383753 --section rule
```

这条规则的正文是：

```text
当用户说 `/goal`、`创建目标`、`使用 goal`、`开干`、`开始执行目标`、`跑长任务`，或要求把一批需求压进目标推进时，必须把这视为执行启动协议，而不是普通目标文案。默认执行规则如下：

1. 启动前先明确目标、范围、非范围、真实完成标准和逐项验收清单；如果目标被切得太小，先指出范围风险并把用户已确认的一批需求纳入同一目标。
2. 按完整计划系统推进，锚定 source of truth、story、roadmap、设计方案或用户原话；执行中不能方向漂移，不能只做第一个可见切片。
3. 所有计划内功能点都要完整闭环，不交半成品；禁止只做 happy path、UI 壳、接口半截、placeholder、fake route、隐藏测试入口、内存替代、假外部动作或 fallback 制造两套真相。
4. 实现时同步保证可维护性、可扩展性、稳健性和鲁棒性：模块按真实边界拆分，职责清楚，必要时清理直接相关的脏逻辑和死代码；不要为了假想未来做空泛抽象。
5. 验证必须走真实入口和真实用户路径；命令、功能、状态、文档或证据要逐项覆盖。工具成功、局部 smoke、代码写完都不能单独代表完成。
6. 对复杂或高风险目标，完成后主动做自检；必要时 dispatch 外部模型或 review 流程，重点检查方向是否漂移、功能是否完整、实际可用性、架构质量和可维护性。
7. 完成判断必须 fail closed：只要还有计划功能未做完、验收未通过、证据缺失、环境阻塞未说明或风险未交代，就不能把目标标记为 complete；应继续修复或明确 blocked。
8. 最终交付要面向用户说明体验变化、已验证证据、风险限制和待确认项。
```

最后的效果是：Agent 不是每轮都背着这段长规则，而是在用户真的说 `/goal`、`创建目标`、
`开干` 这类执行启动话术时，才把它作为候选经验判断。如果确实采用，最终回复可以写
`**本次使用 1条 OME 经验卡：** ...`；如果用户只是讨论业务目标、OKR，或者只是问
`/goal` 是什么，这张卡会被忽略，也不会出现在最终使用披露里。

## 自己验证一次

不需要真的给 Agent 发任务，也可以用 `ome match` 模拟同一条链路：

```bash
ome match "创建目标，开干，把这个功能完整做完并自己验证" --explain
```

如果想看 task envelope、命中原因和最终渲染的 `additionalContext`，加上 `--json`：

```bash
ome match "创建目标，开干，把这个功能完整做完并自己验证" --explain --json
```
