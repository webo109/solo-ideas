# Solo — Setup

Sections:
1. **Run the new migration** (`0004`) — required for docs reader, archive, AI fields, chat
2. **Set up AI Edge Functions** (Supabase CLI + Gemini key) — required for AI organize / suggest / chat
3. **Optional: Resend SMTP** — removes magic-link rate limit
4. **Local dev**

---

## 1. Run migration `0004` (required)

In your Supabase project:

1. Open https://supabase.com/dashboard/project/dkdrhfwlknctmhnuaeop/sql/new
2. **Clear** the editor (Ctrl+A → Delete)
3. Open + copy the migration: https://raw.githubusercontent.com/webo109/solo-ideas/main/supabase/migrations/0004_pinned_organized_chat.sql
4. Paste into editor → **Run**
5. Expect: "Success. No rows returned."

Adds: `pinned`, `organized_text`, `ai_organized_at`, `ai_schedule`, `ai_last_run_at`, `ai_suggestions` to `items`; `ai_enabled` to `projects`; new `chat_threads` and `chat_messages` tables. **Idempotent** — safe to re-run.

> If you haven't run `0003` yet, run that first ([0003 link](https://raw.githubusercontent.com/webo109/solo-ideas/main/supabase/migrations/0003_projects_and_items.sql)).

---

## 2. AI Edge Functions (required for AI features)

Three functions ship with this repo: `ai-organize`, `ai-suggest`, `ai-chat`. They live in `supabase/functions/` and need to be deployed to your Supabase project.

### 2.1 — Rotate the leaked Gemini key first

⚠️ The key `AIzaSyBGcD2ZKXkUS-KmZqPgqg-5MhkxFT8XBFk` is in this chat's transcript. Treat as compromised.

1. https://aistudio.google.com/app/apikey
2. Find that key → click **⋮** → **Delete API key**
3. Click **Create API key** → pick or create a project → **Copy** the new key
4. **Don't paste it in chat.** Hold it for step 2.4 below.

### 2.2 — Install Supabase CLI

**Windows (PowerShell):**
```powershell
scoop install supabase
```
Or via npm:
```bash
npm install -g supabase
```
Verify: `supabase --version`

### 2.3 — Link your local repo to the Supabase project (one time)

From the Solo folder:
```bash
supabase login
supabase link --project-ref dkdrhfwlknctmhnuaeop
```
The `login` command opens your browser to authorize the CLI.

### 2.4 — Set the Gemini key as a function secret

```bash
supabase secrets set GEMINI_API_KEY=PASTE_YOUR_NEW_KEY_HERE
```
Optionally also:
```bash
supabase secrets set GEMINI_MODEL=gemini-2.0-flash-exp
```
Verify:
```bash
supabase secrets list
```
The key value is masked — you'll only see `GEMINI_API_KEY` listed.

### 2.5 — Deploy the three functions

```bash
supabase functions deploy ai-organize --no-verify-jwt=false
supabase functions deploy ai-suggest  --no-verify-jwt=false
supabase functions deploy ai-chat     --no-verify-jwt=false
```
The `--no-verify-jwt=false` flag (which is the default) keeps Supabase Auth's JWT check on, so only signed-in users can call them.

### 2.6 — Test it

1. Open the deployed app, sign in
2. Go to a project → click ✎ (edit) → toggle **Enable AI for this project** → Save
3. Click the **💬** chat icon in the topbar → ask "what's open in this project?"
4. The chat should stream a response.

If you see an error banner like "ai-chat: 401" or "GEMINI_API_KEY is not set", revisit step 2.4 (secret) and 2.5 (deploy).

---

## 3. (Optional) Resend SMTP — removes magic-link email rate limit

Default Supabase email service caps at ~2 magic links/hour. Resend free tier gives 100/day.

### 3.1 — Resend account + API key

1. https://resend.com → Sign up (GitHub login fastest)
2. https://resend.com/api-keys → **Create API Key** · permission **Sending access** · domain **All domains** → **Add**
3. Copy the `re_…` key. Don't paste it in chat — keep it in a notes app.

### 3.2 — Plug into Supabase

1. https://supabase.com/dashboard/project/dkdrhfwlknctmhnuaeop/settings/auth → scroll to **SMTP Settings**
2. Toggle **Enable Custom SMTP** → ON
3. Fill:
   - **Sender email**: `onboarding@resend.dev` (single-user, no DNS) or your verified domain address
   - **Sender name**: `Solo`
   - **Host**: `smtp.resend.com`
   - **Port**: `465`
   - **Username**: `resend`
   - **Password**: your `re_…` API key
4. **Save**

---

## 4. Local development

```bash
python3 -m http.server 8765
```
Open `http://localhost:8765/`. ES modules require a server.

For magic-link sign-in to redirect back to localhost, ensure `http://localhost:8765/**` is in **Auth → URL Configuration → Redirect URLs**.

---

## 5. After your first sign-in: lock down signups

Supabase → **Authentication → Sign In / Up Providers → Email** → toggle off **Allow new users to sign up** → **Save**. Now only your existing user can request magic links.

---

## Files reference

| Where | What |
|---|---|
| `src/config.js` | Public Supabase URL + anon key (safe to commit) |
| `src/api.js` | CRUD for projects, items, chat threads, chat messages |
| `src/ai.js` | Calls Edge Functions (organize, suggest, chat stream) |
| `supabase/migrations/000*.sql` | Database migrations — run in order |
| `supabase/functions/ai-*` | Edge Functions — deploy via `supabase functions deploy <name>` |
| `supabase/functions/_shared/` | Shared helpers (CORS, auth, Gemini client) |
