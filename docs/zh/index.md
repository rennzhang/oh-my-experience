---
layout: home

hero:
  name: Oh My Experience
  text: 别再把同一条教训讲第二遍。
  tagline: 把真实编码纠正沉淀为经验卡，在 prompt 阶段自动召回——只在用得上的时候出现。
  image:
    src: /ome-logo.png
    alt: Oh My Experience logo
  actions:
    - theme: brand
      text: 2 分钟试用
      link: /zh/guides/quickstart
    - theme: alt
      text: 看真实召回
      link: /zh/guides/examples

features:
  - title: 按需召回，不撑爆上下文
    details: Hook 把 prompt 拆成 task envelope 做 BM25-like 匹配，命中了才注入，没命中就什么都不加。
  - title: 不过审不进库
    details: 经验卡走 candidate → draft → active → archived。AI 生成的候选你先审核，只有批准的 active 卡才被召回。
  - title: 一套库，Codex 和 Claude 共享
    details: 同一套经验卡、同一个召回引擎，安装各自的 hook 就行。
  - title: 本地运行，隐私默认
    details: 全在本机。Hook 不调 LLM、不存原始 prompt，默认只存 prompt hash。
  - title: 可解释的召回
    details: 用 ome match --explain 看命中了哪些卡、为什么命中、会注入什么内容。
  - title: 上下文压缩也丢不掉
    details: AGENTS.md 只在开头注入一次，压缩后就丢了。OME 的 hook 每次 UserPromptSubmit 重新注入。
---

## 选择你的路径

- 第一次了解 OME：看 [快速开始](/zh/guides/quickstart)。
- 想先看真实效果：看 [`/goal` 实际案例](/zh/guides/examples)。
- 想评估设计：看 [召回引擎](/zh/architecture/retrieval-engine)。

## 一次真实召回长什么样

```text
$ ome match "创建目标开干，把这个功能完整做完并自己验证" --explain

Matched:
- 创建目标时进入完整闭环交付模式
  Why: task looks like real goal execution
  Rule: ome experience show agent-goal-execution --section rule
```

OME 不是每轮都加载所有经验，而是在 prompt 真的像某个工作流时，才挂载相关候选经验。
