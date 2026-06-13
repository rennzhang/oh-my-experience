---
title: Examples
status: active
---

# Examples

The easiest way to understand OME is to look at a real prompt-time recall.
This example uses a goal-start prompt because it shows the core difference
between a generic rule file and a conditional experience card.

## Example: `/goal` Starts Full-Closure Delivery

Assume your active library contains a reviewed card for goal execution. In this
example the card is named `创建目标时进入完整闭环交付模式`. Its usage criteria say
to use it when `/goal`, `创建目标`, or `开干` starts a real execution task, and
to ignore it for documentation examples, feature explanations, or business-goal
discussion.

When the user sends:

```text
创建目标，开干，把这个功能完整做完并自己验证
```

OME decomposes the prompt into a task envelope. It detects goal execution
wording, explicit execution intent, and real validation wording. That is enough
to list the goal card as a high-risk, must-use candidate. Candidate does not
mean automatically used; the agent still checks the card's workflow meaning
against the current task before reading and applying the full rule.

## What Gets Mounted Into The Agent Prompt

The hook mounts a compact context block. The frame is English so Codex and
Claude receive one stable instruction shape. The card content stays in the
language stored on the card.

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

The linked path is rendered from the user's own library. A global library uses
the user's `dataDir`; a project library uses
`<project-root>/.oh-my-experience/`.

## What The Agent Reads Next

The mounted context intentionally stays short. If the lesson applies, the agent
then fetches the rule body:

```bash
ome experience show 创建目标时进入完整闭环交付模式-40383753 --section rule
```

The rule says:

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

The result is not "always add more rules." The agent sees this as a candidate
only when the current prompt looks like goal execution. If it actually uses the
card, the final response can include `**本次使用 1条 OME 经验卡：** ...`. If the user
is only discussing business goals, OKRs, or asking what `/goal` means, the card
is ignored and does not appear in the final usage line.

## Try It Yourself

Use `ome match` to inspect the same path without sending a real agent prompt:

```bash
ome match "创建目标，开干，把这个功能完整做完并自己验证" --explain
```

Use `--json` when you want to inspect the task envelope, reasons, and rendered
`additionalContext` programmatically:

```bash
ome match "创建目标，开干，把这个功能完整做完并自己验证" --explain --json
```
