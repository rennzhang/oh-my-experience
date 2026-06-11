# Oh My Experience

[English](README.md) | [简体中文](README.zh-CN.md)

别再把同一条教训讲第二遍。

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
- 用 Markdown review 文件和 CLI 完成低心智负担的审核闭环
- 隔离的评估环境，调召回参数不会弄脏真实库

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
ome hook install --provider codex   # 安装 Codex hook
ome hook install --provider claude  # 安装 Claude hook
ome hook status --provider codex    # 查看状态
```

## 经验卡长什么样

不是笔记，是一条可执行的行为修正。每张卡记录：

- 上次在哪里翻车了
- 要避免的做法
- 正确的做法
- 什么任务该触发它（triggers）
- 什么情况不该触发（negative triggers）
- 适用哪些项目（global / 当前项目 / 同组织）
- 风险等级
- 证据来源（哪次 reflect、哪段会话）

## 文档

- [快速开始](docs/zh/guides/quickstart.md)
- [安装配置](docs/zh/guides/setup.md)
- [CLI 参考](docs/zh/reference/cli.md)
- [召回引擎](docs/zh/architecture/retrieval-engine.md)
- [中文文档](docs/zh/index.md)
- [English docs](docs/index.md)

## 许可证

MIT
