# Solo — Ideas & Solutions

A single-user idea tracker. Type a problem, hit Enter, add a solution when you find one, check it off, watch confetti fly. Syncs across your devices in real time.

**Stack:** plain HTML/CSS/JS (no build step) · Supabase (Postgres + Auth + Realtime) · Vercel (hosting) · ES modules.

## Quick start

If you just cloned this repo, see [SETUP.md](./SETUP.md) — five minutes to live.

## Local development

```bash
python3 -m http.server 8765
```

Then `http://localhost:8765/`. ES modules don't load from `file://`, so the local server is required.

## Architecture

```
Browser  ─HTTPS / WebSocket─▶  Supabase  (auth, postgres, realtime)
   │
   ▼ git push
GitHub  ─────────────▶  Vercel (auto-deploy)
```

**Frontend modules** (`src/`):
- `config.js` — Supabase URL + anon key (placeholders until you fill them in; see SETUP.md)
- `supabase.js` — singleton Supabase client
- `auth.js` — magic-link sign-in, session, sign-out
- `store.js` — CRUD against the `ideas` table
- `realtime.js` — subscribe to row-level changes for the current user
- `migrate.js` — one-time import of existing localStorage data

**Backend** (`supabase/schema.sql`):
- `ideas` table with `id`, `user_id`, `text`, `solution`, `done`, `position`, timestamps
- Row Level Security: each user can only see/modify their own rows
- Realtime publication enabled on the table
- `updated_at` trigger

## Keyboard shortcuts

- **Enter** in the input — add a task
- **Tab / Shift+Tab** — move focus between input, checkboxes, delete buttons
- **Space / Enter** on a focused checkbox — toggle complete
- **Space / Enter** on a focused × button — delete

## Reduced motion

If the OS prefers reduced motion, animations, parallax, and confetti are suppressed.

## Palette

| Token | Hex | Role |
| --- | --- | --- |
| `--bg-base` | `#0a0a0f` | page background |
| `--text-main` | `#f8f9fa` | primary text |
| `--text-muted` | `#a0aabf` | muted text |
| `--pop` | `#7f00ff` | primary accent |
| `--pop2` | `#e100ff` | secondary accent |

Font: **Outfit** via Google Fonts.

## Security model

- Supabase URL + `anon` key ship in the browser (safe by design — RLS is the protection)
- Every query is filtered by `auth.uid()` via RLS policies
- After your first sign-in, disable new signups in Supabase Auth settings (see SETUP.md step 4) so the URL can't be hijacked
- Never commit the `service_role` key

## License

Private project. Not licensed for distribution.
