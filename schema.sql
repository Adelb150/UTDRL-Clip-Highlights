-- Rocket League "Clip of the Week" schema
-- Run this in the Supabase SQL editor once, on a fresh project.

create extension if not exists "pgcrypto";

-- One row per Discord "week" of voting (Mon–Sun, adjust as you like)
create table if not exists weeks (
  id            uuid primary key default gen_random_uuid(),
  week_start    date not null unique,
  week_end      date not null,
  closed        boolean not null default false,
  winner_clip_id uuid, -- set after the week closes
  created_at    timestamptz not null default now()
);

-- One row per clip pulled from #game-highlights
create table if not exists clips (
  id                 uuid primary key default gen_random_uuid(),
  discord_message_id text not null unique, -- dedupe key, also prevents re-inserting
  channel_id         text not null,
  author_discord_id  text not null,
  author_username    text not null,
  clip_url           text not null,        -- medal.tv / streamable / youtube link
  posted_at          timestamptz not null, -- when it was posted in Discord
  week_id            uuid not null references weeks(id),
  created_at         timestamptz not null default now()
);

alter table weeks
  add constraint weeks_winner_fk
  foreign key (winner_clip_id) references clips(id);

-- One row per (clip, voter) — the unique constraint IS the "one vote per clip" rule
create table if not exists votes (
  id               uuid primary key default gen_random_uuid(),
  clip_id          uuid not null references clips(id) on delete cascade,
  voter_discord_id text not null, -- pulled from the Discord OAuth session
  created_at       timestamptz not null default now(),
  unique (clip_id, voter_discord_id)
);

-- Simple key/value table so the GitHub Action script remembers where it left off
create table if not exists sync_state (
  key   text primary key,
  value text
);

create index if not exists idx_clips_week on clips(week_id);
create index if not exists idx_votes_clip on votes(clip_id);

-- ── Row Level Security ─────────────────────────────────────────────
-- Public site: anyone can READ clips/weeks/vote counts.
-- Only a logged-in Discord user can INSERT a vote, and only as themselves.
-- All writes to `clips`/`weeks` come from the GitHub Action using the
-- service_role key, which bypasses RLS entirely — so no policy is needed
-- for those inserts.

alter table weeks enable row level security;
alter table clips enable row level security;
alter table votes enable row level security;

create policy "public can read weeks"
  on weeks for select
  using (true);

create policy "public can read clips"
  on clips for select
  using (true);

create policy "public can read votes"
  on votes for select
  using (true);

-- auth.jwt() -> raw_user_meta_data ->> 'provider_id' is the Discord user ID
-- that Supabase Auth stores when someone logs in via the Discord provider.
create policy "logged-in users can vote as themselves"
  on votes for insert
  with check (
    voter_discord_id = (auth.jwt() -> 'user_metadata' ->> 'provider_id')
  );

create policy "users can remove their own vote"
  on votes for delete
  using (
    voter_discord_id = (auth.jwt() -> 'user_metadata' ->> 'provider_id')
  );
