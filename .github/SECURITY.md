# Security Policy

Oh My Experience is local-first. It stores experience cards, reflect runs,
indexes, hook events, and config on the user's machine.

## Supported Versions

Security fixes target the latest published version and the current `main` branch.

## Reporting A Vulnerability

Do not open a public issue for a vulnerability that exposes local data, prompt
contents, hook payloads, private paths, or configuration.

Report privately by emailing:

```text
zhangren.aidev@gmail.com
```

Please include:

- affected version or commit;
- operating system and Node.js version;
- reproduction steps;
- whether raw prompt logging, Spool import, Codex hooks, Claude hooks, or project libraries were involved;
- the minimum necessary logs or redacted snippets.

## Security Boundaries

OME should not:

- send prompts, code, cards, or hook payloads to a network service during recall;
- store raw prompts unless the user explicitly enables raw prompt logging;
- write active experience cards outside the reviewed lifecycle;
- overwrite agent hooks without an explicit setup action;
- delete local libraries unless the user intentionally requests deletion.

If behavior crosses one of these boundaries, treat it as a security-sensitive bug.
