<p align="center">
  <img src="docs/public/brand/ome-logo-lockup.png" alt="Oh My Experience (OME)" width="560">
</p>

<h1 align="center">Oh My Experience</h1>

<p align="center"><strong>别再把同一条教训讲第二遍。</strong></p>
<p align="center">一个本地优先的 prompt-time 编码 Agent 经验召回层。</p>

<p align="center">
  <a href="https://github.com/rennzhang/oh-my-experience/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/rennzhang/oh-my-experience/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/oh-my-experience"><img alt="npm version" src="https://img.shields.io/npm/v/oh-my-experience.svg"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Node.js 20 plus" src="https://img.shields.io/badge/node-20%2B-339933.svg">
  <img alt="Local-first" src="https://img.shields.io/badge/local--first-yes-111827.svg">
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="docs/zh/index.md">中文文档</a>
</p>

Oh My Experience 是一个本地优先的 AI 编码经验召回层。它把真实 Codex 和 Claude
会话里的纠正、返工和交付教训整理成经过审核的经验卡；下一次类似任务出现时，在
prompt 阶段把最相关的提醒给到 Agent。

OME 不是让你写更多规则，而是让提醒出现得更准：在 Agent 还来得及改变下一步动作时，
给它看到那条真正相关的经验。

## 快速试用

```bash
npx oh-my-experience@latest init
```

然后把一个真实任务发给 Agent：

```text
创建目标并开干：在 /tmp/ome-todo-demo 里做一个小型单页 Todo 应用，使用原生 HTML、CSS 和 JavaScript。
它需要支持新增任务、标记完成、删除任务、清空已完成、显示剩余数量、用 localStorage 保存任务，并且在窄屏手机视口下也可用。
完成前请通过真实浏览器入口验证。
完成后，请引导我走一遍 OME 生命周期：全量扫描这次运行，总结可复用经验，和我一起审查生成的草稿，然后只把确认通过的草稿加入经验库。
```

已安装的 hook 会自动处理召回。排障时让 Agent 检查召回即可；用户第一次跑通时不需要
额外手动搜索。

## 为什么需要 OME

`AGENTS.md` / `CLAUDE.md` 适合放项目地图、全局规范和稳定约定。Skills 适合封装
可重复执行的流程。Memory 适合保存事实、偏好和长期背景。

OME 存的是另一类东西：执行判断。

Rules 是常驻约束。OME 是按场景召回的执行判断记忆。

OME 不替代 memory、`AGENTS.md`、`CLAUDE.md` 或 skills。它只在当前任务需要时，
召回经过审核的执行经验。

很多经验不是常驻规则，而是条件性提醒。它们只在 UI、发布、Git、review 或某个项目
上下文里有用。把这些内容全塞进入口规则文件，会消耗上下文，也会稀释真正该看的提醒。
OME 把它们移出常驻上下文，只在任务匹配时召回。

## 你会得到什么

- 本地优先：prompt 阶段召回不走网络。
- 先审批再召回：经验卡遵循 `candidate -> draft -> active -> archived`。
- Codex 和 Claude hook 共用同一套本地 runtime。
- 支持全局经验库，也支持项目根目录 `.oh-my-experience/`。
- 可解释召回：能看到命中的卡、分数、原因和压入上下文。
- 隔离评估：调召回策略前可以先测漏召和误召。

## 默认本地

- 没有云服务，也不需要账号。
- 不调用 embedding API。
- Hook 热路径不调 LLM。
- 原始 prompt 日志默认关闭，需要时手动开启。
- Hook 失败时 fail open，不阻塞 Agent。

## 实际案例

当你在 Codex 里使用 `/goal` 类指令：

```text
创建目标并开干：在 /tmp/ome-todo-demo 里做一个小型单页 Todo 应用。
它需要支持新增、完成、删除、清空已完成、剩余数量、localStorage 保存，并通过真实浏览器验证。
```

OME 可以在 Codex 开始行动前召回已经确认入库的经验卡
`创建目标时进入完整闭环交付模式`。用户不需要关心底层调用了什么；真正有价值的是，
Agent 在行动前看到了正确的执行判断。

这张经验会提醒 Agent：

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

重点是出现时机：这段规则不会常驻塞进每轮 prompt，而是在任务真的像目标执行时才出现；
如果用户只是讨论文档、OKR，或者只是问 `/goal` 是什么，它就不该出现。完整 walkthrough
见 [实际案例](docs/zh/guides/examples.md)。

## 它怎么工作

```text
真实会话 -> 复盘扫描 -> 经验草稿审批 -> 确认 active 卡 -> prompt 阶段召回 -> 统计 -> 迭代
```

1. 扫描或检查真实编码 Agent 会话。
2. 把重复纠正和返工点整理成经验草稿。
3. 先审批、合并、重写或拒绝，再决定是否启用。
4. 明确确认哪些经验成为 active，之后由 hook 在任务匹配时召回。

只有 `active` 状态的经验卡会被召回。OME 不会把 AI 生成的笔记静默变成永久规则。

## 文档

本地开发源码版本：

```bash
git clone https://github.com/rennzhang/oh-my-experience.git
cd oh-my-experience
npm install
npm run build
node bin/ome.js init
```

- [快速开始](docs/zh/guides/quickstart.md)
- [第一张经验卡](docs/zh/guides/first-card.md)
- [实际案例](docs/zh/guides/examples.md)
- [安装配置](docs/zh/guides/setup.md)
- [全局与项目经验库](docs/zh/guides/project-libraries.md)
- [CLI 参考](docs/zh/reference/cli.md)
- [召回引擎](docs/zh/architecture/retrieval-engine.md)
- [English docs](docs/index.md)

## 贡献与安全

- [贡献指南](.github/CONTRIBUTING.md)
- [安全策略](.github/SECURITY.md)
- [更新日志](CHANGELOG.md)

## 许可证

MIT
