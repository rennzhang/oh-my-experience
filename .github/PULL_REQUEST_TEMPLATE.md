## Summary

- 

## User Impact

- 

## Validation

- [ ] `npm run check`
- [ ] `npm test`
- [ ] `npm run docs:build` if docs or navigation changed
- [ ] `npm run validate:dogfood` for release, packaging, hook, or recall-runtime changes

## Notes

- Recall changes should mention expected precision/recall impact.
- Hook changes must stay local, deterministic, and fail-open.
- Do not include private prompt text, local session logs, or unredacted paths.
