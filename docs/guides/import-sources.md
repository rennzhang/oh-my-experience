---
title: Import Sources
status: active
---

# Import Sources


OME can start with Codex local sessions only. That is enough to create a local
experience library and validate prompt-time recall.

Spool is a local AI session index that unifies Claude, Codex, Gemini, and other
agent histories into one searchable pool.

Without Spool, OME still draws from the current conversation and explicitly
imported Codex sessions; the core path is intact. With Spool, OME can do
index-first lookup and pull evidence on demand, which avoids dumping raw
sessions into context and saves tokens. Recommended for multi-agent users:
broader coverage without flooding context with think traces and tool logs. It
is optional only because OME core recall works without it.

## Why This Is Optional

OME keeps `ome init` focused on the core path: local library setup and agent
recall hooks. Interactive init may offer Spool only after that core setup has
succeeded, and only after explaining the tradeoff.

Use Spool only when you want broader session coverage. OME does not require it
for Codex recall, and scripted init paths never install it.

## What You Get With Spool

- More historical sessions available for reflect scans.
- Better coverage across different agents and work surfaces.
- No change to the approval-first lifecycle: imported sessions still become
  candidates first, not active cards.

## Check Availability

```bash
ome source status
```

If Spool is available, OME reports the detected version. If it is not available,
install only the CLI package, then run the check again:

```bash
npm install -g @spool-lab/cli
```

OME does not install the Spool desktop client or app. The project page is
`https://github.com/spool-lab/spool`.

## Import

```bash
ome source import spool --limit 50
```

Equivalent command:

```bash
ome import spool --limit 50
```

Use filters when you want a narrower source set:

```bash
ome import spool --query "browser validation" --source codex
```

## After Import

Ask your agent to include imported records in the reflect source audit,
then keep the normal reviewed lifecycle:

```bash
ome reflect start
ome reflect apply <run-id> --dry-run
ome reflect apply <run-id>
ome experience promote <draft-card-id>
```

Imported material should never bypass review. Spool expands the source pool; it
does not change OME's safety model.
