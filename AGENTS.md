# Gather — Evend monorepo

## What this is

- **Evend** — Expo / React Native app at the repo root (`src/`, `app.json`, root `package.json`). Stack: Expo ~54, React 19, NativeWind / Tailwind, TypeScript.
- **admin-web** — Next.js **16** admin dashboard (`admin-web/`). Stack: Next 16, React 19, Tailwind v4, Supabase SSR.

Backend and auth are primarily **Supabase** (see `src/lib/supabase.ts` and `admin-web/src/lib/supabase/`).

## Layout

| Area | Path |
|------|------|
| Mobile app screens, navigation, hooks | `src/` |
| Admin UI, API routes, middleware | `admin-web/src/` |

## Secrets and env

- **Never commit** `.env`, `.env.local`, or keys. They are gitignored.
- Do not paste production secrets into issues, commits, or chat. Use env vars and local files only.

## Agents and skills

- **Project facts** live in this file and in `admin-web/AGENTS.md` (Next.js-specific notes).
- Optional **global skills** on this machine live under `~/.cursor/skills/` (e.g. `frontend-design`, `find-docs`, Superpowers workflows). When a task clearly matches a skill’s purpose, follow that skill’s `SKILL.md` after reading it—do not rely on stale training data for library APIs.

## Commands (reference)

- Mobile: `npx expo start` / `npm run start` (see root `package.json`).
- Admin: `cd admin-web && npm run dev` (see `admin-web/package.json`).

## Next.js admin only

For breaking Next 16 APIs and file conventions, read **`admin-web/AGENTS.md`** before changing `admin-web/`.
