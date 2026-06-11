---
title: Category Flow
status: active
---

# Category Flow

Categories are part of the reflect-to-recall lifecycle, not a visual-only filter.

## End-To-End Path

```text
session/source
  -> reflect guide asks for category
  -> candidateFromLesson keeps or infers category
  -> reflect decision can override category
  -> ome reflect apply creates draft with category
  -> approve draft creates active card with category
  -> library filters and edits by category
  -> card index includes category for recall and display
```

## Product Rules

- `category` is a first-class field on candidates, cards, and the active index.
- `sources` records evidence and provenance only. Do not store category as a
  source value.
- Reflect candidate generation should provide a category. If omitted, the CLI infers one
  from title, topics, triggers, summary, and rule.
- Users can create a category before assigning it. Empty categories are allowed;
  they make later candidate intake easier.
- Review should keep the default path light: show the category in the worksheet
  and expose override only when the inferred category is wrong.

## Default Categories


These are starting points, not a closed taxonomy. Users may create more
categories from the CLI. Project fit belongs in `applicability`, not in category
names.
