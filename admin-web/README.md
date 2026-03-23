# Gather Admin Web

Separate web admin dashboard for Gather operations and moderation.

## Included in this scaffold

- Admin login page (`/login`) using Supabase Auth
- Protected dashboard layout (`/dashboard/*`) with sidebar
- Vendor applications management page (`/dashboard/vendor-applications`)
- Placeholder pages for listings moderation and user management

## Setup

1. Copy env file:

```bash
cp .env.example .env.local
```

2. Fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

3. Start dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Auth and roles

The dashboard currently checks:

- signed-in user exists
- `profiles.role` is one of:
  - `super_admin`
  - `admin`
  - `moderator`
  - `support`

If not authorized, user is redirected to `/login`.

## Next build steps

- Add approve/reject actions on vendor applications
- Add listings moderation controls (hide/remove/flag)
- Add user account moderation actions
- Add audit logs for all admin actions
