---
layout: home

hero:
  name: Oh My Experience
  text: 别再把同一条教训讲第二遍。
  tagline: 把真实编码中踩过的坑沉淀为经验卡，在 prompt 阶段自动召回——只在用得上的时候出现。
  image:
    src: /ome-logo.png
    alt: Oh My Experience logo
  actions:
    - theme: brand
      text: 开始了解
      link: /zh/guides/introduction
    - theme: alt
      text: 快速开始
      link: /zh/guides/quickstart

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
