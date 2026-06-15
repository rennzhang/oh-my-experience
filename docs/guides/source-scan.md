---
title: Source Scan
status: active
---

# Source Scan

OME can start with Codex local sessions only. That is enough to create a local
experience library and validate prompt-time recall.

Spool is a local AI session index that unifies Claude, Codex, Gemini, and other
agent histories into one searchable pool.

Without Spool, OME still draws from the current conversation and explicitly
scanned Codex sessions; the core path is intact. With Spool, OME can do
index-first lookup and pull evidence on demand, which avoids dumping raw
sessions into context and saves tokens. Recommended for multi-agent users:
broader coverage without flooding context with think traces and tool logs.

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

## Without Spool

Scan Codex sessions directly:

```bash
ome source scan codex --sessions ~/.codex/sessions
```

Agents should still expand the focus lens into several short searches before
writing a retrospective audit: likely user wording, synonyms, opposite phrasing,
acceptance criteria, rejection reasons, and nearby module or path names.

## With Spool

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

Prefer search-first evidence lookup:

```bash
spool search "browser validation" --source codex --limit 10 --json
spool show <uuid> --json
```

Run several short searches for the same lens and record the query family in the
retrospective audit. A single query such as `minimal intrusion no baggage` is
only one probe, not evidence that the theme was fully searched.

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
then keep the normal reviewed lifecycle:

```bash
ome reflect start
ome reflect apply <run-id> --dry-run
ome reflect apply <run-id>
ome experience enable <draft-card-id>
```

Scanned material should never bypass review. Spool expands the searchable source
pool; it does not change OME's safety model.
