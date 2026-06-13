---
layout: home

hero:
  name: Oh My Experience
  text: Stop teaching your agent the same lesson twice.
  tagline: Turn real coding corrections into reviewed experience cards that surface at prompt time — only when the task actually needs them.
  image:
    src: /ome-logo.png
    alt: Oh My Experience logo
  actions:
    - theme: brand
      text: Get started
      link: /guides/introduction
    - theme: alt
      text: Quickstart
      link: /guides/quickstart

features:
  - title: Conditional recall, not always-on bloat
    details: Hook decomposes prompts into task envelopes with deterministic BM25-like matching. Cards inject only when triggered — otherwise nothing.
  - title: Nothing enters without review
    details: Cards follow candidate → draft → active → archived. AI-generated candidates go through your approval first. Only active cards are recalled.
  - title: One library, Codex and Claude
    details: Same cards, same retrieval engine, shared across providers. Install each hook once.
  - title: Local-first, private by default
    details: Everything on your machine. No cloud, no accounts. The hook path calls no LLM, stores no raw prompts.
  - title: Explainable matching
    details: Use ome match --explain to see which cards hit, why they scored, and what context would be injected.
  - title: Survives context compression
    details: AGENTS.md injects once then gets compressed away. OME's hook re-injects on every UserPromptSubmit.
---
