// pull-clips.mjs
// Fetches new messages from the #game-highlights Discord channel, pulls out
// clip links (medal.tv / streamable / youtube / twitch clips), and inserts
// them into Supabase — assigning each one to the week it was actually
// POSTED in (not the week the script happens to run).
//
// Runs on a schedule via GitHub Actions (see .github/workflows/pull-clips.yml).
// Uses the Supabase *service_role* key, which bypasses RLS, so this must
// only ever run server-side (GitHub Actions secret), never in the browser.

import { createClient } from "@supabase/supabase-js";

const {
  DISCORD_BOT_TOKEN,
  DISCORD_CHANNEL_ID,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

for (const [name, val] of Object.entries({
  DISCORD_BOT_TOKEN,
  DISCORD_CHANNEL_ID,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
})) {
  if (!val) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Matches clip links from the hosts your club actually uses. Add more as needed.
const CLIP_URL_REGEX =
  /https?:\/\/(?:www\.)?(?:medal\.tv\/[^\s]+|streamable\.com\/[^\s]+|clips\.twitch\.tv\/[^\s]+|youtu\.be\/[^\s]+|youtube\.com\/(?:shorts|watch)[^\s]+)/gi;

async function getLastMessageId() {
  const { data, error } = await supabase
    .from("sync_state")
    .select("value")
    .eq("key", "last_message_id")
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

async function setLastMessageId(id) {
  const { error } = await supabase
    .from("sync_state")
    .upsert({ key: "last_message_id", value: id });
  if (error) throw error;
}

async function fetchNewMessages(afterId) {
  const messages = [];
  let after = afterId;

  while (true) {
    const url = new URL(
      `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`
    );
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url, {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
    });

    if (!res.ok) {
      throw new Error(
        `Discord API error ${res.status}: ${await res.text()}`
      );
    }

    const batch = await res.json();
    if (batch.length === 0) break;

    messages.push(...batch);
    after = batch[batch.length - 1].id;

    if (batch.length < 100) break; // no more pages
  }

  return messages;
}

// Monday–Sunday week (UTC) that contains the given date.
function getWeekBounds(date) {
  const day = date.getUTCDay(); // 0 = Sunday
  const diffToMonday = (day + 6) % 7;

  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - diffToMonday);
  monday.setUTCHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    week_start: monday.toISOString().slice(0, 10),
    week_end: sunday.toISOString().slice(0, 10),
  };
}

// Cache so we only hit Supabase once per distinct week within a single run,
// even if this run is backfilling clips spanning many different weeks.
const weekIdCache = new Map();

async function getOrCreateWeekId(date) {
  const { week_start, week_end } = getWeekBounds(date);

  if (weekIdCache.has(week_start)) return weekIdCache.get(week_start);

  const { data: existing, error: selErr } = await supabase
    .from("weeks")
    .select("id")
    .eq("week_start", week_start)
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    weekIdCache.set(week_start, existing.id);
    return existing.id;
  }

  const { data: inserted, error: insErr } = await supabase
    .from("weeks")
    .insert({ week_start, week_end })
    .select("id")
    .single();
  if (insErr) throw insErr;

  weekIdCache.set(week_start, inserted.id);
  return inserted.id;
}

// Discord message IDs are snowflakes — the timestamp is encoded in the
// first 42 bits. Used as a fallback if a message somehow lacks `timestamp`.
function snowflakeToDate(id) {
  return new Date(Number((BigInt(id) >> 22n) + 1420070400000n));
}

async function main() {
  const lastId = await getLastMessageId();
  const messages = await fetchNewMessages(lastId);

  if (messages.length === 0) {
    console.log("No new messages since last run.");
    return;
  }

  const rows = [];
  for (const msg of messages) {
    const matches = msg.content?.match(CLIP_URL_REGEX);
    if (!matches) continue;

    const postedAt = msg.timestamp ? new Date(msg.timestamp) : snowflakeToDate(msg.id);
    const weekId = await getOrCreateWeekId(postedAt);

    for (const clipUrl of matches) {
      rows.push({
        discord_message_id: msg.id,
        channel_id: DISCORD_CHANNEL_ID,
        author_discord_id: msg.author.id,
        author_username: msg.author.username,
        clip_url: clipUrl,
        posted_at: postedAt.toISOString(),
        week_id: weekId,
      });
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from("clips")
      .upsert(rows, { onConflict: "discord_message_id", ignoreDuplicates: true });
    if (error) throw error;
    console.log(`Inserted ${rows.length} new clip(s).`);
  } else {
    console.log(`Scanned ${messages.length} message(s), no clip links found.`);
  }

  await setLastMessageId(messages[messages.length - 1].id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
