# Solo — Setup (5 minutes)

The code, schema, and deploy config are done. Three short steps to take it live.

---

## 1) Run the database schema (1 min)

In your Supabase project:

1. Left sidebar → **SQL Editor** → **+ New query**
2. Open `supabase/schema.sql` from this repo, copy everything, paste into the editor
3. Click **Run** (bottom right)

You should see "Success. No rows returned." That created the `ideas` table, the Row Level Security policies, the `updated_at` trigger, and added the table to the realtime publication.

---

## 2) Wire your Supabase keys (30 sec)

In your Supabase project: **Project Settings → API** — copy these two values:

- **Project URL** (e.g. `https://abcdefgh.supabase.co`)
- **Project API keys → `anon` `public`** (a long `eyJ...` JWT)

Open `src/config.js` and replace:

```js
export const SUPABASE_URL = 'YOUR_SUPABASE_URL';
export const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

with your real values, then commit + push:

```bash
git add src/config.js
git commit -m "Wire Supabase config"
git push
```

> Note: the `anon` key is **safe to commit**. It's designed to ship in the browser — Row Level Security is what protects your data. Never commit the `service_role` key.

---

## 3) Configure Supabase Auth redirect URL (30 sec)

So magic links return to your deployed site:

1. Supabase → **Authentication → URL Configuration**
2. **Site URL**: paste your Vercel deploy URL (e.g. `https://solo-ideas.vercel.app`)
3. **Redirect URLs**: add the same URL plus any preview/local URLs you'll use, one per line:
   ```
   https://solo-ideas.vercel.app
   http://localhost:8765
   ```
4. **Save**

---

## 4) (Recommended) Lock signups to your email only (1 min)

Without this, anyone who knows the URL could sign up too. After **you** sign in once:

- Supabase → **Authentication → Sign In / Up Providers → Email**
- Toggle **Allow new users to sign up** → **OFF**
- Save

Now only existing users (you) can request magic links.

---

## 5) Sign in (1 min)

1. Open your deployed Vercel URL
2. Type your email → **Send link**
3. Open your email, click the link → returns to the app, signed in

Add an idea on your phone, watch it appear on your desktop in real time.

---

## Local development

```bash
python3 -m http.server 8765
```

Then `http://localhost:8765/`. The app uses ES modules, so opening `index.html` directly via `file://` won't work — needs the local server.

For local development you must also add `http://localhost:8765` to **Redirect URLs** in Supabase Auth (see step 3).

---

## Migrating existing localStorage data

If you used Solo before adding the backend, the first time you sign in on a device it will automatically import any ideas stored in `localStorage` (under the keys `eureka.v1` or `tada.v1`). Migration runs once per device and only if the cloud is empty.

---

## Sanity check

Open the deployed app, sign in, add an idea. Then in Supabase → **Table Editor → ideas** you should see your row. If you do, everything's wired up.
