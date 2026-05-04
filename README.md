# Solo — Ideas & Solutions

A single-user knowledge tracker. Capture **notes, ideas, tasks, docs** under projects, optionally let Gemini organize and suggest, and chat with your own data. Realtime sync across devices.

**Stack:** plain HTML/CSS/JS (no build step) · Supabase (Postgres + Auth + Realtime + Edge Functions) · Google Gemini · Vercel (hosting) · ES modules.

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
   │                            │
   │                            └──▶  Edge Functions  ─▶  Gemini API
   ▼ git push
GitHub  ─────────────▶  Vercel (auto-deploy)
```

**Frontend modules** (`src/`):
- `config.js` — Supabase URL + anon key (placeholders until you fill them in; see SETUP.md)
- `supabase.js` — singleton Supabase client
- `auth.js` — magic-link sign-in, session, sign-out
- `api.js` — CRUD for projects, items, chat threads, chat messages
- `ai.js` — calls to Edge Functions (`organizeDoc`, `suggestForItem`, `chatStream`) + markdown helpers
- `markdown.js` — `marked` + `DOMPurify` rendering
- `realtime.js` — postgres-changes subscriptions for projects + items
- `migrate.js` — one-time import from legacy localStorage data

**Backend** (`supabase/`):
- `migrations/0002_increase_text_limit.sql` — relax old `ideas.text` length
- `migrations/0003_projects_and_items.sql` — `projects` + `items` (notes / ideas / tasks / docs), archive, RLS, realtime, one-shot migrate from `ideas`
- `migrations/0004_pinned_organized_chat.sql` — pin docs, AI fields on items (`pinned`, `organized_text`, `ai_organized_at`, `ai_schedule`, `ai_last_run_at`, `ai_suggestions`), `projects.ai_enabled`, `chat_threads`, `chat_messages`
- `functions/ai-organize` — Gemini cleans markdown structure of a doc, preserving the user's words
- `functions/ai-suggest` — kind-aware suggestions (idea ↦ 3 approaches, task ↦ next-step plan, note ↦ TL;DR + bullets)
- `functions/ai-chat` — streaming Gemini chat scoped to AI-on projects (privacy gate)
- `functions/_shared/{auth,cors,gemini}.ts` — JWT user-resolution, CORS helpers, Gemini client

**Tables:**
- `projects` (`name`, `color`, `position`, `ai_enabled`)
- `items` (`project_id`, `kind`, `text`, `solution?`, `status`, `position`, `done_at?`, `pinned`, `organized_text?`, AI scheduling cols)
- `chat_threads` (one per day per user, plus ad-hoc)
- `chat_messages` (`thread_id`, `role`, `content`)

Row Level Security: every table is filtered by `auth.uid() = user_id`. Realtime publication includes all tables.

## Keyboard shortcuts

- **Enter** in the composer — add an item (Shift+Enter for newline)
- **Click the circle** on an item — open → today → archived
- **Tab / Shift+Tab** — focus composer, checkboxes, action buttons
- **Esc** — close any open modal, the reader, the chat panel, or the AI menu

## Reduced motion

If the OS prefers reduced motion, animations, parallax, blob drift, and confetti are suppressed.

## Palette

| Token | Hex | Role |
| --- | --- | --- |
| `--bg-base` | `#0a0a0f` | page background |
| `--text-main` | `#f8f9fa` | primary text |
| `--text-muted` | `#a0aabf` | muted text |
| `--pop` | `#7f00ff` | primary accent |
| `--pop2` | `#e100ff` | secondary accent |
| `--pop3` | `#00d2ff` | tertiary accent |

Font: **Outfit** via Google Fonts.

## Security model

- Supabase URL + `anon` key ship in the browser (safe by design — RLS is the protection)
- Every query is filtered by `auth.uid()` via RLS policies
- Edge Functions run with JWT verification on (`--no-verify-jwt=false` default); each function additionally calls `requireUser()` to confirm a real signed-in user
- The `GEMINI_API_KEY` lives only in Supabase function secrets; never sent to the browser
- After your first sign-in, disable new signups in Supabase Auth settings (see SETUP.md) so the URL can't be hijacked
- Never commit the `service_role` key

## Privacy gate (AI)

- Each project has an **AI enabled** toggle. Off by default.
- `ai-chat` only sees projects where `ai_enabled = true`. Off-projects are invisible to Gemini.
- `ai-organize` and `ai-suggest` operate on individual items; the frontend only exposes the buttons inside AI-on projects.

## License

Private project. Not licensed for distribution.
