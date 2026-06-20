---
description:
alwaysApply: true
---

# Evend (Gather) — agent instructions

## What this is

- **Evend mobile:** Expo / React Native — repository root; app code in `src/` (npm package name `evend`).
- **Gather admin:** Next.js 16 — `admin-web/`

Separate conventions per app; do not mix routers, styling, or env patterns between them.

## Key paths

- Mobile Supabase: `src/lib/supabase.ts`
- Admin Supabase: `admin-web/src/lib/supabase/`
- Cursor rules: `.cursor/rules/gather-repo.mdc` (repo-wide), `evend-mobile.mdc` (`src/**`), `gather-admin-web.mdc` (`admin-web/**`)

## Non-negotiables

1. **Supabase:** Use project clients and established patterns. Respect **RLS**; no service-role keys in client or app code.
2. **Secrets:** Never commit or paste `.env` / `.env.local` / keys / production secrets.

## Skills & docs

- If a task fits a **skill**, read `SKILL.md` first. Global: `~/.cursor/skills/**`; project: `.cursor/skills/**` if present.
- For version-sensitive APIs (Expo ~54, Next 16, Supabase), use **find-docs** / Context7 rather than guessing signatures.

## MCP

- Prefer **MCP** when it fits (Supabase, browser QA, etc.). Read tool descriptors before calling.

## Automation

- Implement and verify with available commands; escalate only when blocked (secrets, prod risk, unclear product choice).
- **Evidence:** state what was run before claiming success.

## Commands

**Mobile** (repository root):

| Command | Purpose |
| --- | --- |
| `npm start` | Expo dev server |
| `npm run start:dev` | Expo with dev client |
| `npm run ios` / `npm run android` / `npm run web` | Platform targets |

**Admin** (`admin-web/`): see `admin-web/AGENTS.md` for `dev`, `lint`, `build`, `start`.

**Mobile:** root `package.json` has no `lint` / `tsc` script yet; rely on Expo dev (`npm start`) and IDE TypeScript for `src/`. If you add a scoped check, keep it limited to `src/` so it does not pick up `admin-web/` (separate `tsconfig`).

## Code style

- Match neighboring code; small focused changes; no unsolicited new docs.
