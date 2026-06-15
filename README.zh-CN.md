<p align="center">
  <img src="docs/public/brand/ome-logo-lockup.png" alt="Oh My Experience (OME)" width="560">
</p>

<h1 align="center">Oh My Experience</h1>

<p align="center"><strong>别再把同一条教训讲第二遍。</strong></p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="docs/zh/index.md">中文文档</a>
</p>

`AGENTS.md` 里塞了几十条规则，但每次对话真正相关的也就几条——其余的全在白白
消耗 token，还把该看的提醒淹没了。

Oh My Experience 做的事情很简单：把你在 AI 编码中踩过的坑沉淀为经验卡，然后在
下一次类似任务时自动把相关的提醒注入 prompt。不是在每轮对话里无脑堆规则，而是
只在用得上的时候出现。

```bash
npx oh-my-experience init
```

## AGENTS.md 的规则已经够多了，为什么还要这个？

AGENTS.md 有两个问题。

第一，它常驻——每轮对话都带全量，但大部分规则其实是条件性的。比如「UI 做完要跑
真实浏览器验证」，在你改后端代码的时候用不上，却每一轮都占着上下文。规则越多，
每条的存在感越弱，Agent 反而更容易忽略真正该看的那条。

第二，更隐蔽：AGENTS.md 只在对话开头注入一次。长对话会被上下文压缩，压缩之后
开头注入的规则可能就丢了——Agent 做着做着突然忘了你定过的规矩。

OME 的 hook 每次 `UserPromptSubmit` 都跑一遍，经验是每轮重新注入的，不依赖对话
开头的那一次加载，不会被压缩吃掉。

匹配逻辑是确定性的——把 prompt 拆成 task envelope，做 BM25-like 评分，命中了就
注入，没命中就什么都不加。

你不需要扔掉 AGENTS.md，OME 跟它不冲突。AGENTS.md 继续放那几条在什么场景下都该
生效的硬规则，OME 负责在合适的时机补上条件性提醒。

## 几个你可能会关心的问题

### 召回会不会拖慢 Agent？

不会。Hook 路径不调 LLM、不走网络、不跑 embedding，纯本地确定性检索，默认 4 秒
超时。而且它是 fail-open 的——哪怕 hook 挂了，你的 prompt 照样正常发出去，不会
被阻塞。

### 隐私怎么处理？

所有数据都在你本机。没有云服务，没有账号，没有远程同步。

Hook 日志默认只存 prompt 的哈希值和任务摘要，不存你的代码和对话原文。如果你需要
调试，可以手动开启原始 prompt 记录，但会带 TTL 自动过期。

### AI 生成的规则靠谱吗？会不会把噪声写进规则库？

不会。经验卡的生命周期是 `candidate → draft → active → archived`。

Agent 做完 reflect 复盘后，生成的候选经验会先进入 review 阶段，由你逐条决定
approve / reject / merge / rewrite。通过的会变成 draft，你再 approve 之后才会
进入 active。**只有 active 状态的卡片会被 hook 召回。**

没有任何自动化流程能绕过人工审核直接写 active。AI 产生的噪声不会变成永久规则。

### 我同时用 Codex 和 Claude，要维护两套规则吗？

不用。同一套经验卡，同一套召回引擎，Codex 和 Claude 共用。安装好各自的 hook
就行。

### 怎么知道哪些规则在用、哪些已经没用了？

`ome stats` 可以看到每张卡被召回了多少次、哪些卡长期没命中、整体召回覆盖率怎么样。
规则扔进去就看不到反馈？在 OME 里不会。

## 它能干什么

- 从 Codex 会话导入历史记录（可选接入 Spool 索引 Claude 等更多来源）
- Agent 做 reflect 复盘，把翻车点变成候选经验卡
- 你审核候选，决定哪些值得入库
- Prompt 阶段自动召回相关经验，注入 additional context
- 支持全局经验库和项目根目录 `.oh-my-experience/` 项目经验库
- 用 Markdown review 文件和 CLI 完成低心智负担的审核闭环
- 隔离的评估环境，调召回参数不会弄脏真实库

## 仓库结构

根目录只保留公开项目面：

```text
bin/        CLI 入口
packages/   TypeScript 源码包
docs/       指南、参考、架构和文档资源
skills/     随包分发的 OME Agent skill
templates/  经验卡模板
examples/   示例经验卡
tests/      单元、集成和 CLI 测试
scripts/    发布与验证脚本
.github/    CI、贡献指南和安全策略
```

OME 是 Node.js CLI 包，所以根目录不放 Python package metadata。

## 怎么用

装好之后大概就四步：

**1. 导入会话**

```bash
ome import codex --sessions ~/.codex/sessions
```

**2. 让 Agent 做复盘**

不用你自己写规则。跟 Agent 说「帮我对最近的会话做一次 OME reflect」，它会扫描
已有会话，找到你纠正过的地方，生成候选经验卡。

**3. 审核**

候选经验不会自动生效。先看生成的 Markdown review 文件，觉得有用的 approve，没用的
reject，差不多的可以 merge 或 rewrite。通过后写为 draft，再 approve 才进入 active。

**4. 召回**

之后每次发 prompt，hook 会自动匹配相关经验并注入。比如你让 Agent 修 UI，它会
被提醒「UI 任务要跑真实浏览器验证才能说完成」。

可以用 `ome match` 模拟召回效果：

```bash
ome match "修复登录页 UI 并在浏览器里验证" --explain
```

## 经典案例：`/goal` 触发完整闭环交付模式

当你对 Agent 说：

```text
创建目标，开干，把这个功能完整做完并自己验证
```

OME 会命中已经审核过的目标执行经验卡，并在 Agent 开始行动前压入这段紧凑上下文：

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

然后 Agent 会读取完整经验规则，把 `/goal` 当成执行启动协议处理：先明确范围和验收
清单，再完整实现、真实路径验证，证据不完整就不能标记完成。完整过程见
[实际案例](docs/zh/guides/examples.md)。

## 安装

```bash
# npm 发布后
npx oh-my-experience init

# 或全局安装
npm install -g oh-my-experience
ome init
```

`ome init` 会引导你设置库路径、安装 hook、写入内置示例卡。先用内置卡跑一下感受
召回效果，再让 Agent 扫你的真实会话。

Hook 管理：

```bash
ome init --provider codex   # 配置 Codex hook
ome init --provider claude  # 配置 Claude hook
ome init --provider all     # 两个都配置
ome hook status --provider codex    # 查看状态
```

## 全局与项目经验库

`dataDir` 是全局经验库，可以保留默认路径，也可以指向 Obsidian 等本地专用目录。

如果某个仓库需要携带自己的经验卡，在项目里初始化项目库：

```bash
ome project init
ome project status
```

提示词阶段 OME 会同时读取全局库和项目库。你也可以只用全局库，通过项目适用范围做
非侵入式召回；只有当经验应该跟仓库一起走时，才把卡片放进 `.oh-my-experience/`。

## 经验卡长什么样

不是笔记，是一条可执行的行为修正。每张卡记录：

- 上次在哪里翻车了
- 要避免的做法
- 正确的做法
- 什么时候该用（`criteria.use_when` / `recall.triggers`）
- 什么情况不要用（`criteria.ignore_when`）
- 适用范围（`scope`：global / 当前项目 / 同组织）
- 风险等级
- 证据来源（哪次 reflect、哪段会话）

## 文档

- [快速开始](docs/zh/guides/quickstart.md)
- [实际案例](docs/zh/guides/examples.md)
- [安装配置](docs/zh/guides/setup.md)
- [全局与项目经验库](docs/zh/guides/project-libraries.md)
- [CLI 参考](docs/zh/reference/cli.md)
- [召回引擎](docs/zh/architecture/retrieval-engine.md)
- [中文文档](docs/zh/index.md)
- [English docs](docs/index.md)

## 贡献与安全

- [贡献指南](.github/CONTRIBUTING.md)
- [安全策略](.github/SECURITY.md)
- [更新日志](CHANGELOG.md)

## 许可证

MIT
