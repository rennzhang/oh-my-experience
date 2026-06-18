# OME Language Policy

## Rule

OME framework instructions stay English. Card content targets English or
Chinese according to the card approval context. User-visible OME recall prose
follows the user's response language only when it is English or Chinese.

## English Framework

Keep these surfaces English:

- skill instructions and reference files
- CLI framework output and help text
- JSON field names and machine contracts
- fixed hook additional-context instructions
- hook labels such as `Summary`, `Use if`, `Ignore if`, `Rule`, and
  `Final link if used`

These are product instructions, not experience content.

## Card Content

Experience card content uses the language chosen when the card is created or
approved. Do not translate it only because the surrounding OME frame is English.

This includes `title`, `summary`, criteria, triggers, topics, `rule`, and
review-page draft text.

Choose the card language by future recall fit:

- Chinese user/source wording -> Chinese card by default.
- English user/source wording -> English card by default.
- Mixed source -> choose the clearer future recall language.
- Explicit user preference overrides the default, within English or Chinese.

If source material is in another language, preserve original wording as evidence
when useful, but write the approved card in English or Chinese. `auto` and
`mixed` are compatibility or detection states; newly approved cards should
settle on English or Chinese content.

## Evidence

Evidence may preserve the original language for user corrections, acceptance or
rejection wording, source snippets, counterexamples, and retrospective audit
notes. Do not translate direct quotes just to make audit records uniform.

## Agent Output

The injected prompt may be English, but it should tell the agent to write
user-visible recall output in the user's response language when that language is
English or Chinese.

This includes:

- the short "OME reminded me..." style sentence before acting
- the final line that says how many OME experience cards were actually used
- retrospective or scan-result prose shown to the user

Keep the disclosure semantics stable: list only cards actually used, and link
only their `Final link if used` values. Do not force a fixed English wording for
that user-visible line when the user's supported response language is Chinese.

## Do Not

- Do not add runtime language settings for hook additional context.
- Do not translate card content in the hook hot path.
- Do not rewrite existing cards only to match the English frame.
- Do not treat mixed-language additional context as a failure when the mixed
  part is user-authored card content.
