# Per-Change Changelog Files

One file per shipped change. Named `YYYY-MM-DD-short-slug.md` (e.g. `2026-09-28-ai-context-location.md`).
Version tags in this repo are created by hand after a successful deploy, so the date is the key
you know when writing the entry; add the tag once it exists.

## When to create one

Every change that reaches production, no matter how small — same trigger as this project's
AGENTS.md §7. Every push to `main` reaches production.

## What goes in it

```markdown
# <YYYY-MM-DD> — <short title>

**Type:** feat | fix | chore | refactor | docs
**Scope:** <area of the codebase affected>
**Release:** <vX.Y.Z tag, once created>
**Supabase SQL:** <migration file run before deploy, or "none">

<One-paragraph summary of what changed.>

**Why:** <the decision/rationale — what problem this solved, what was tried before, what broke.
This is the part an auto-generated PR-title changelog can never produce.>

**Files changed:** <short list or "see commit diff">
```

## How this feeds release notes

When cutting a formal release (`gh release create vX.Y.Z`), compile the notes from every
changelog file since the previous tag instead of relying solely on an auto-generated "PR titles"
release-notes feature — that loses the "why." If a release was already created, edit its notes
with the compiled version rather than creating a duplicate.

## Retroactive backfill

Not required. Starts from the next shipped change going forward.
