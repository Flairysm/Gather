---
description: 
alwaysApply: true
---

# Claude / AI assistant — read first

@AGENTS.md — project facts, stack, and non-negotiables. Follow it before writing or changing code.

## Session behavior

1. **Skills:** When a task matches an installed skill (`~/.cursor/skills/` or project `.cursor/skills/`), **read that skill’s `SKILL.md` first** and follow its workflow.
2. **MCP:** When MCP servers are available, **use them as the first option** for what they support (e.g. DB inspection, provider APIs, browser QA). Inspect tool schemas before calling; prefer tools over guessing.
3. **Docs:** For unfamiliar or version-sensitive APIs (Supabase, Expo, Next.js, etc.), use **find-docs** / Context7 / official docs—verify signatures; don’t rely on memory alone.
4. **Execution:** **Automate completion**—implement changes, run allowed checks, use MCP/commands yourself. Only ask the user when blocked (secrets, irreversible prod, or unclear product choice) after reasonable attempts.
5. **Scope:** Change only what the task requires. No drive-by refactors.
6. **Secrets:** Never commit, paste, or log `.env`, keys, or tokens.

## Quick stack

- **Evend mobile** (Expo, `src/`) and **Gather admin** (Next 16, `admin-web/`): **do not mix** conventions—see `AGENTS.md` for paths and commands.
- **Supabase:** auth, DB, realtime—follow `src/lib/supabase.ts` and `admin-web/src/lib/supabase/`; respect RLS.

## Definition of done

- Matches existing patterns; minimal diff.
- Evidence when claiming success (what was run / verified), not untested assertions.
