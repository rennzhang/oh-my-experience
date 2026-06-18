---
title: Source Scan
status: active
---

# Source Scan

OME's core retrospective path uses native Codex and Claude session files. That
is enough to create a local experience library and run high-quality evidence
review without any optional source bridge.

Spool is a local AI session index that unifies Claude, Codex, Gemini, and other
agent histories into one searchable pool.

Without Spool, OME still draws from native Codex/Claude sources and the current
conversation; the core path is intact. With Spool, OME can add more providers as
a supplemental source. Spool improves coverage for extra agents, but it is not
required for a qualified Codex/Claude deep scan.

## Clean Storage Model

`ome source scan` writes a pointer source index. It does not copy full original
transcripts into OME.

The index keeps source path, provider, time, cwd, message count, and metadata
hash. New scans leave `summary` empty by default. For older indexes, run:

```bash
ome source clean
ome source clean --yes
```

The first command is a dry run. The second removes legacy summaries and
materialized-session markers from the source index.

## Native User Evidence Index

Build a temporary user-only index before a retrospective:

```bash
ome source user-index build --provider all --json
```

The command prints an `indexPath`. Agents use that file for repeated searches:

```bash
ome source user-index search "browser validation" --index <file> --json
ome source user-index show <hit-id> --index <file> --context 4 --json
```

`user-index` is an evidence workbench for agents. It keeps user messages in a
temporary index file, does not update the long-term source index, and does not
summarize experience cards. The agent still owns query expansion, counterexample
search, context replay, and final synthesis.

## Matched Cards During Retrospectives

Prompt-time recall can still match existing OME cards while an agent is running a
retrospective. That is expected: process and governance cards can help the agent
scan carefully.

Those matched cards are not source evidence for a new experience. Subject-area
matches should be recorded only as active-card overlap checks, such as whether
the result is new, should be merged, narrowed, archived, or kept separate. The final
used-card disclosure should mention only process or governance cards the agent
actually applied during the retrospective.

## Without Spool

Scan Codex sessions directly:

```bash
ome source scan codex --sessions ~/.codex/sessions
```

Agents should still expand the focus lens into several short searches before
writing a retrospective audit: likely user wording, synonyms, opposite phrasing,
acceptance criteria, rejection reasons, and nearby module or path names.

For qualified deep scans, prefer the native `user-index` path above. `source
scan codex` remains a pointer-index command for source cataloging.

## With Spool As Supplemental Source

Check availability and enable Spool as a source:

```bash
ome source status
ome source connect spool --mode enabled
```

Before a deep scan, check and refresh Spool:

```bash
spool status
spool sync
```

Prefer search-first supplemental lookup:

```bash
spool search "browser validation" --source codex --limit 10 --json
spool show <uuid> --json
```

Run several short searches for the same lens and record the query family in the
retrospective audit. A single query such as `minimal intrusion no baggage` is
only one probe, not evidence that the theme was fully searched. Spool hits should
be treated as extra leads; core evidence still goes through native user-only
indexing and original context replay when available.

Then scan only the high-value slice:

```bash
ome source scan spool --query "browser validation" --source codex --limit 50
```

Avoid starting a retrospective with a broad Spool scan for fuzzy topics such as
architecture, fallback, or source-of-truth. Broad scans can hit very large
sessions and fail after partial success. Narrow the query, inspect the result,
and record any fallback in the retrospective audit.

If a high-value result is skipped because the session is large, raise the limit
explicitly:

```bash
ome source scan spool --query "browser validation" --max-session-bytes 4194304
```

## After Source Scan

Ask your agent to include scanned source records in the reflect source audit,
then keep the normal draft approval flow:

```text
Run an OME reflect from the sources we just scanned. Give me only the draft approval page, not JSON.
If I add feedback, refine the same reflect. Wait for my confirmation before adding approved experiences to the library.
```

Scanned material should never bypass draft approval and confirmation. Spool expands the
searchable source pool; it does not change OME's safety model.
