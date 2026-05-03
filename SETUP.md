# Solo — Setup

The code, schema, and deploy config are all done. This doc covers:

- **First-time setup** (do once)
- **Each new schema migration** (run when I push one)
- **Optional: SMTP via Resend** to remove the magic-link email rate limit

---

## First-time setup (already done if you're reading this)

1. **Supabase project** created at https://supabase.com → URL + anon key wired into `src/config.js`
2. **GitHub repo** at https://github.com/webo109/solo-ideas
3. **Vercel project** auto-deploying `main` to https://solo-ideas.vercel.app
4. **Vercel Deployment Protection** disabled (so the public URL is reachable)
5. **Supabase Auth → URL Configuration** → Site URL set to `https://solo-ideas.vercel.app`

If you ever need to set up a fresh project from this code, follow the original schema in `supabase/schema.sql` and the steps above.

---

## Run migrations when I push them

Each time I add a `.sql` file under `supabase/migrations/`, paste it into the Supabase SQL Editor and run it.

1. https://supabase.com/dashboard/project/dkdrhfwlknctmhnuaeop/sql/new
2. **Clear** any existing SQL in the editor (Ctrl+A → Delete)
3. Open the migration file from GitHub (e.g. https://raw.githubusercontent.com/webo109/solo-ideas/main/supabase/migrations/0003_projects_and_items.sql), copy everything
4. Paste into the SQL Editor → click **Run**
5. Expect: "Success. No rows returned."

All migrations are idempotent — safe to run multiple times.

### Pending migrations

| File | Status | Description |
|---|---|---|
| `0002_increase_text_limit.sql` | Run when ready | Bump idea text from 200 → 2000 chars |
| `0003_projects_and_items.sql` | **Run before using new UI** | Adds projects + items tables, archive system, copies existing ideas into "Inbox" project |

> Important: `0003` is **additive** — your `public.ideas` table is left intact. The migration only *copies* data into the new structure.

---

## (Recommended) Set up SMTP via Resend — removes the email rate limit

The default Supabase email service caps you at ~2 magic-link emails/hour. Setting up Resend gives you 100 emails/day for free, no card required.

### Step 1 — Create a Resend account (2 min)

1. Go to https://resend.com → **Sign up** (use GitHub login for speed)
2. Verify your email when prompted

### Step 2 — Get an API key (30 sec)

1. https://resend.com/api-keys → **Create API Key**
2. Name it `Solo` · Permission: **Sending access** · Domain: **All domains**
3. Click **Add** → **copy the key** (starts with `re_…`). You'll see it only once.
4. **Don't paste it in chat.** Keep it in a notes app for the next step.

### Step 3 — Pick a sender (choose one path)

**Path A — Use Resend's default `onboarding@resend.dev` (fastest, fine for personal use)**
- No DNS setup needed
- Limit: only sends to your own verified email (the one you signed up with)
- Perfect for a single-user app — that's exactly your case

**Path B — Verify your own domain (5 min, looks more professional)**
- Resend → **Domains** → **Add Domain** → enter your domain
- Add the DNS records they show (TXT, MX, DKIM) at your registrar
- Wait for verification (usually < 5 min)
- Use `noreply@yourdomain.com` as the sender

For a single-user productivity app, **Path A is plenty**.

### Step 4 — Plug into Supabase (1 min)

1. https://supabase.com/dashboard/project/dkdrhfwlknctmhnuaeop/settings/auth
2. Scroll to **SMTP Settings** (or **Custom SMTP**)
3. Toggle **Enable Custom SMTP** → ON
4. Fill in:
   - **Sender email**: `onboarding@resend.dev` (Path A) or your verified address (Path B)
   - **Sender name**: `Solo`
   - **Host**: `smtp.resend.com`
   - **Port**: `465`
   - **Username**: `resend`
   - **Password**: paste the API key from Step 2 (starts with `re_…`)
   - **Minimum interval between emails**: `0` (or whatever Supabase shows)
5. Click **Save**

### Step 5 — Test

1. Sign out of the app
2. Sign in with your email
3. Magic link should arrive within seconds, no rate-limit error

If it doesn't work:
- Path A: confirm the email you used to sign up for Resend is the *same* email you're trying to magic-link
- Check Supabase Auth logs: dashboard → **Logs** → **Auth Logs**

---

## Local development

```bash
python3 -m http.server 8765
```

Then `http://localhost:8765/`. ES modules require a server (won't work via `file://`).

For magic-link sign-in to redirect back to localhost, ensure `http://localhost:8765/**` is in your **Auth → URL Configuration → Redirect URLs**.

---

## After Solo's first sign-in: lock down signups

Once you've signed in once and your user exists in Supabase:

1. **Authentication → Sign In / Up Providers → Email**
2. Toggle **Allow new users to sign up** → **OFF**
3. Save

This means only you (existing user) can ever request magic links. New emails get rejected.
