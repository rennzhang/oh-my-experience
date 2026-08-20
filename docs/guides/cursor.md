---
title: Cursor Guide
status: active
---

# Cursor Guide

Cursor uses the same provider-neutral hook runtime as Codex and Claude. Same
cards, same retrieval engine. Cursor support is a native adapter, not a Claude
compatibility shortcut.

## Supported mapping

| Cursor event | Normalized event |
| --- | --- |
| `beforeSubmitPrompt` | `prompt.submit` |

The runtime reads Cursor `workspace_roots` for project-aware recall. Do not
rely on the hook process working directory; user-level Cursor hooks run from
`~/.cursor`.

## Hook And Skill Installation

```bash
ome init --provider cursor --dry-run   # Preview
ome init --provider cursor             # Install
```

The installer writes the hook to `~/.cursor/hooks.json` `beforeSubmitPrompt`
and installs the bundled OME skill to `~/.cursor/skills/oh-my-experience`. It
merges with existing Cursor hooks and does not remove unrelated commands.

**Have your agent do it:**

```text
Help me install the Oh My Experience Cursor hook.

1. Run `ome init --provider cursor --dry-run` first to preview what will be written.
2. If the preview is safe, run `ome init --provider cursor`.
3. Run `ome hook status --provider cursor` to confirm the hook is enabled.
```

Cursor Desktop and Cursor Agent CLI both run project and user hooks on an
interactive prompt submit. The first argument to `cursor-agent --print` is not
a reliable recall path.

If Cursor also has a Claude OME hook enabled through third-party hook loading,
`ome doctor` warns. Keep the Cursor native hook as the Cursor path.

## Using Cursor with Codex or Claude

```bash
ome init --provider all
```

One library, one retrieval engine. `all` installs Codex, Claude, and Cursor.

## Rule

Do not fork retrieval logic for Cursor. Cursor-specific code handles hook
install/status paths, payload normalization, and native `hooks.json` shape.
