# RL Clip of the Week — backend scaffold

This is the foundation: it pulls clip links out of `#game-highlights` and
stores them in Supabase, with voting rules ready to go. The public
GitHub Pages voting site is the next piece to build on top of this.

## What's here

- `sql/schema.sql` — run once in the Supabase SQL editor. Creates `weeks`,
  `clips`, `votes`, and sets up Row Level Security so only logged-in
  Discord users can vote, and only once per clip.
- `scripts/pull-clips.mjs` — reads new messages from your Discord channel,
  extracts clip links (medal.tv / streamable / twitch clips / youtube),
  and inserts them into Supabase, tagged to the current week.
- `.github/workflows/pull-clips.yml` — runs the script every hour for free
  via GitHub Actions. No server to host or pay for.

## Setup

### 1. Create a Discord bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → New Application
2. Bot tab → Add Bot → copy the token (this is `DISCORD_BOT_TOKEN`)
3. Under **Privileged Gateway Intents**, you don't need any special intents
   for this script — it only reads message history via REST, it doesn't
   maintain a live connection.
4. OAuth2 → URL Generator → check `bot` scope, and under bot permissions
   check **View Channel** + **Read Message History**. Use the generated
   URL to invite the bot to your server.
5. Right-click `#game-highlights` in Discord (Developer Mode must be on,
   User Settings → Advanced) → Copy Channel ID → this is `DISCORD_CHANNEL_ID`.

### 2. Create a Supabase project

1. [supabase.com](https://supabase.com) → New Project (free tier is plenty
   for this)
2. SQL Editor → paste in `sql/schema.sql` → Run
3. Project Settings → API → copy:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key (NOT the `anon` key) → `SUPABASE_SERVICE_ROLE_KEY`
     — this one is powerful, never put it in frontend code, only in
     GitHub Actions secrets.

### 3. Enable Discord login for voting (for later, when you build the site)

Supabase Authentication → Providers → Discord → you'll need a separate
Discord OAuth app (Developer Portal → New Application → OAuth2) with a
Client ID/Secret and the redirect URL Supabase gives you. The frontend
will use the `anon` public key (different from the service_role key
above) plus `supabase.auth.signInWithOAuth({ provider: 'discord' })`.

### 4. Wire up GitHub Actions

In your repo: Settings → Secrets and variables → Actions → New repository
secret, add all four:

- `DISCORD_BOT_TOKEN`
- `DISCORD_CHANNEL_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Then push this repo up. The workflow runs hourly on its own, or you can
trigger it manually from the Actions tab to test it immediately.

## Next step

The frontend: a static page (GitHub Pages) that reads from `clips`/`weeks`
using the Supabase `anon` key, lets people log in with Discord, and casts
votes. Happy to scaffold that next once this half is confirmed working.
