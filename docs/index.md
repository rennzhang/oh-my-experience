---
layout: home

hero:
  name: Oh My Experience
  text: Stop teaching your agent the same lesson twice.
  tagline: Turn real coding corrections into approved experience cards that surface at prompt time — only when the task actually needs them.
  image:
    src: /ome-logo.png
    alt: Oh My Experience logo
  actions:
    - theme: brand
      text: Try in 2 minutes
      link: /guides/quickstart
    - theme: alt
      text: See real recall
      link: /guides/examples

features:
  - title: Conditional recall, not always-on bloat
    details: Hook decomposes prompts into task envelopes with deterministic BM25-like matching. Cards inject only when triggered — otherwise nothing.
  - title: Nothing enters without draft approval
    details: Cards follow candidate → draft → active → archived. AI-generated drafts wait for your approval first. Only active cards are recalled.
  - title: One library, Codex and Claude
    details: Same cards, same retrieval engine, shared across providers. Install each agent hook and skill once.
  - title: Local-first, private by default
    details: Everything on your machine. No cloud, no accounts. The hook path calls no LLM, stores no raw prompts.
  - title: Explainable matching
    details: Agents and debugging scripts can inspect which cards hit, why they scored, and what context would be injected.
  - title: Survives context compression
    details: AGENTS.md injects once then gets compressed away. OME's hook re-injects on every UserPromptSubmit.
---

## Choose Your Path

- New to OME? Start with [Quickstart](/guides/quickstart).
- Want proof first? See the [`/goal` recall example](/guides/examples).
- Evaluating the design? Read [Retrieval Engine](/architecture/retrieval-engine).

## A Real Recall Shape

When the user sends a real execution prompt, the installed hook gives the agent
a compact candidate list with the matched card, why it matched, and the command
for reading the full rule.

OME does not load every lesson all the time. It mounts the relevant candidate
when the prompt looks like the workflow that needs it.
