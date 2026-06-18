# OME Similarity Check

## Use For

Use this before adding cards and during library governance. It answers one
question: how should a candidate, topic, or card cluster coexist with adjacent
active cards?

## Inputs

- Candidate card: `summary`, `criteria.use_when`, `criteria.ignore_when`,
  `recall.triggers`, `scope`, and `rule`.
- Or governance topic: title, triggers, positive examples, and counterexamples.
- Active library from `ome experience list --status active --json`.

`ome match "<candidate summary or use_when>" --explain --json` may help, but it
is not the only duplicate detector. It only shows what a phrasing would recall.

## Criteria

For each adjacent card, ask:

1. Same entrypoint: do `use_when`, triggers, title, or user phrasing point to
   the same real workflow?
2. Same decision: does the rule solve the same execution decision or failure?
3. Same layer: are scope, category, and project boundaries aligned?
4. Separatable boundary: can `ignore_when`, scope, topics, or triggers split the
   sub-scenarios cleanly?
5. False-positive cost: would a wrong recall make the result worse?

Width rule:

- Keep narrow scenarios narrow. Anchor triggers to the real execution entrypoint
  and add exclusion boundaries. Missing a recall is better than polluting
  unrelated tasks.
- Broad scenarios may stay broad when the lesson applies to most related tasks
  and would not make ordinary tasks worse.

## Actions

Assign candidate and adjacent-card actions separately:

Candidate action:

- `new`: independent scenario; no active card covers it.
- `merge`: same scenario, decision, or failure mode; create a replacement or
  merge into the named active card.
- `narrow`: useful candidate, but tighten triggers, `use_when`, `ignore_when`,
  scope, or topics before approval.
- `reject`: candidate is covered, stale, too narrow, or too weakly evidenced.
- `keep-separate`: lexical similarity only; the candidate can coexist.

Adjacent active-card action:

- `none`: no adjacent active-card change.
- `archive-adjacent`: old card is stale, covered, too narrow to remain useful,
  or consistently pollutes recall.
- `merge-adjacent`: old card should be replaced or merged with the candidate.
- `narrow-adjacent`: old card remains useful but needs tighter boundaries.
- `keep-adjacent`: old card is independent and can stay active.

## Output

Use this shape in `activeCardOverlapQa` or the library review report:

```text
similarityCheck:
- candidate: <candidate id or title>
  adjacent: <active card id/title or none>
  candidateAction: new | merge | narrow | reject | keep-separate
  adjacentAction: none | archive-adjacent | merge-adjacent | narrow-adjacent | keep-adjacent
  reason: <one sentence>
  next: <change before approval, if any>
```

Matched subject-area cards are overlap signals only. They are not evidence for a
new candidate and must not appear in the final used-card disclosure unless the
agent actually applied them as process or governance cards.
