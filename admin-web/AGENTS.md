---
description: Next.js admin app — agent instructions
alwaysApply: true
---

# admin-web — agent instructions

Admin dashboard for **Evend / Gather**. For monorepo-wide rules (Supabase, secrets, mobile vs admin), read repository root **`AGENTS.md`**.

## Stack

- **Next.js 16** (App Router), **React 19**, **Tailwind CSS v4**
- **Supabase** via `@supabase/ssr` and patterns under `src/lib/supabase/`

## Scope

- Follow this app’s patterns: `src/app/` (routes, API routes), `src/lib/`, existing layouts and dashboard structure.
- Do not apply Expo / React Native conventions here; the mobile app lives at repo root `src/`.

## Verification

Before claiming done on admin changes, run from **`admin-web/`**:

- `npm run lint`
- `npm run build` when changes affect routes, types, or anything that could break the production build

## Commands

Run from **`admin-web/`**:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm start` | Serve production build locally (after `build`) |

## Related Cursor rules

- `.cursor/rules/gather-admin-web.mdc` when editing this app
