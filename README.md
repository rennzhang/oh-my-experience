# Oh My Experience

Turn AI coding sessions into a self-improving experience library, then recall the right lessons at prompt time.

Oh My Experience is being developed as an open-source CLI, skill, hook, review, and metrics workflow for turning real AI coding sessions into reusable experience cards.

## Status

This repository is currently a public placeholder for the upcoming release.

Reserved package names:

- npm: [`oh-my-experience`](https://www.npmjs.com/package/oh-my-experience)
- PyPI: [`oh-my-experience`](https://pypi.org/project/oh-my-experience/)
- Skill: [`skills/oh-my-experience`](skills/oh-my-experience/SKILL.md)

## Install

Install the skill with the open agent Skills CLI:

```bash
npx skills add rennzhang/oh-my-experience --skill oh-my-experience
```

Or install globally:

```bash
npx skills add rennzhang/oh-my-experience --skill oh-my-experience -g
```

List available skills in this repository without installing:

```bash
npx skills add rennzhang/oh-my-experience --list
```

## Planned Scope

- Import AI coding sessions, starting with Codex.
- Generate editable retrospective drafts.
- Review and approve experience cards before activation.
- Recall relevant lessons at prompt time through Codex hooks.
- Track recall metrics and suggest experience library maintenance.

## License

MIT
