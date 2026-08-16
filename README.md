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
