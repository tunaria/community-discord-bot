# Student of the Week: setup guide

An optional module that runs a hands-off weekly "Student of the Week" for your community.
Members submit their work, the bot screens and scores the entries, staff get a veto
window, then the winner is announced and published to a file and a small web endpoint.

It is **off by default**. Nothing changes until you set `SOTW_ENABLED=true`.

**Status:** covered by offline unit tests (`npm test`). It has not yet been run against a
live Discord server, a real AI endpoint or a game client, so do the dry run in step 9
before announcing it.

## How it works

1. Members run `!sotw submit <link> <title> | <description>`.
2. Every week (default Sunday 20:00 in your time zone) the bot scores the entries with
   an AI model plus thumbs-up reactions and picks one. With no AI key, reactions alone
   decide.
3. The pick is posted in a private staff channel and goes live after the veto window
   (default 12 hours). Staff can run `!sotw veto` to cancel it; the runner-up is then
   picked. If nobody acts, it publishes.
4. The bot announces the winner and writes `winner.json` and `winner.txt`. If you turn on
   the web endpoint it also serves `/winner.json`, `/winner.txt` and `/student`
   (a redirect to the winner's link).

If anything fails (no entries, AI error, paused), the current winner stays and nothing
partial is published.

## What you need

- The bot already running (see the main README): Node.js 20 or newer, `npm ci`, a `.env`
  with `DISCORD_TOKEN`
- The **Server Members** and **Message Content** intents (already required by this bot)
- About 10 minutes. An AI key is optional.

## Step-by-step setup

### Step 1. Create the channels

| Channel | Who can see it | Purpose |
| --- | --- | --- |
| `#sotw-submissions` | Everyone | The bot posts each entry here. Members react with a thumbs up. |
| `#sotw-staff` | Staff only | Pick notices (with the veto window) and error messages |
| `#sotw-announcements` | Everyone, read only | The weekly winner announcement |
| `#sotw-hall-of-fame` | Everyone, read only (optional) | Archive of past winners |

Give the bot's role **View Channel**, **Send Messages**, **Embed Links**, **Add Reactions**
and **Read Message History** on these channels. It needs no other new permissions.

### Step 2. Copy the channel IDs

In Discord, turn on **User Settings > Advanced > Developer Mode**. Right-click each channel
and choose **Copy Channel ID**.

### Step 3. Edit `.env`

Add these lines (every other `SOTW_` setting has a default; see `.env.example`):

```
SOTW_ENABLED=true
SOTW_SUBMIT_CHANNEL=<ID of #sotw-submissions>
SOTW_STAFF_CHANNEL=<ID of #sotw-staff>
SOTW_ANNOUNCE_CHANNEL=<ID of #sotw-announcements>
SOTW_HALL_CHANNEL=<ID of #sotw-hall-of-fame, or leave empty>
SOTW_TIMEZONE=America/New_York
SOTW_BLOCKED_WORDS=word1,word2
```

Never commit `.env`. It is already git-ignored.

### Step 4. Start the bot

```
npm start
```

Look for `Bot is online`. In Discord, run `!help`. A **Student of the Week** section
should be listed.

### Step 5. (Optional) Turn on AI scoring

```
SOTW_AI_KEY=your-key
SOTW_AI_URL=https://api.openai.com/v1/chat/completions
SOTW_AI_MODEL=gpt-4o-mini
```

Any OpenAI-compatible chat completions endpoint works. What is sent: each entry's title,
description and the site name of its link. No Discord names, IDs or messages are sent.
Entries are passed as data with an instruction to ignore any instructions inside them, and
the reply must be valid scores (0 to 10) or the cycle fails safe and keeps the current
winner.

Optional: set `SOTW_MODERATION_URL` to an OpenAI-style moderation endpoint
(`https://api.openai.com/v1/moderations`) to reject flagged entries at submission. If it is
set and the call fails, the entry is rejected rather than accepted unchecked.

### Step 6. (Optional) Turn on the web endpoint

```
SOTW_HTTP_PORT=8765
SOTW_PUBLIC_URL=http://your-host:8765
```

It listens on `127.0.0.1` by default. If the game server runs on another machine, either
put a reverse proxy in front of it or set `SOTW_HTTP_HOST=0.0.0.0` behind a firewall that
only allows that server. Check it:

```
curl http://127.0.0.1:8765/healthz        -> ok
curl http://127.0.0.1:8765/winner.json    -> current winner ("active": false when none)
curl http://127.0.0.1:8765/winner.txt     -> "Title by Author"
```

### Step 7. Run it as a service

Use whatever you already use for the bot (systemd, pm2, Task Scheduler, NSSM). Back up
the folder in `SOTW_DATA_DIR` (default `data/sotw`). It holds `sotw.json` (entries,
winners, opt-outs) and the winner files.

### Step 8. Know the commands

| Command | Who | What it does |
| --- | --- | --- |
| `!sotw submit <link> <title> \| <description>` | Everyone | Enter this week |
| `!sotw mine` | Everyone | List your entries this week |
| `!sotw withdraw <number>` | Everyone | Withdraw one of your entries |
| `!student` or `!sotw winner` | Everyone | Show the current winner |
| `!sotw optout` / `!sotw optin` | Everyone | Never / again be featured (opt-out removes open entries) |
| `!sotw status` | Manage Server | Live and pending picks, pause state |
| `!sotw run` | Manage Server | Run the weekly cycle now |
| `!sotw veto` | Manage Server | Cancel the pending pick and promote the runner-up |
| `!sotw revert` | Manage Server | Kill switch: clear the winner and pause the cycle |
| `!sotw resume` | Manage Server | Resume after a pause |

### Step 9. Do a dry run before announcing

1. In `.env`, set `SOTW_VETO_HOURS=0`, `SOTW_MIN_ACCOUNT_DAYS=0` and
   `SOTW_MIN_MEMBER_DAYS=0` (or point the channel IDs at test channels). Restart.
2. Run `!sotw submit https://youtube.com/watch?v=test Test entry | A short test description`.
   The entry should appear in `#sotw-submissions`, and `!sotw mine` should list it.
3. Run `!sotw run`. Check the staff notice, the announcement and `winner.txt`.
4. Run `!student`, then `!sotw status`, then `!sotw revert` and confirm the winner is
   cleared. Run `!sotw resume`.
5. Put the settings back and restart.

## Safety and privacy

- **Opt-in feature:** off unless `SOTW_ENABLED=true`.
- **Veto window:** a pick waits `SOTW_VETO_HOURS` (default 12) before going live.
- **Link allowlist:** only sites in `SOTW_LINK_HOSTS` (default: Discord, YouTube, Imgur).
  No embedded credentials and no schemes other than http and https.
- **Filtering:** blocked words (including simple look-alike spellings), mention stripping,
  control-character removal, and the optional moderation check.
- **Limits:** account age (14 days), time in server (3 days), 2 entries a week, duplicate
  links rejected, a short cooldown between submissions.
- **No pings:** the bot's posts never mention anyone.
- **Staff commands** check the Manage Server permission.
- **Client-safe text:** titles and names written to `winner.json` and `winner.txt` have
  markup, links and special characters removed and are length-limited.
- **Data stored:** entries (title, link, description, display name, user ID), scores, picks
  and opt-outs in `sotw.json`. `!sotw optout` removes a member's open entries.
- **Secrets:** `SOTW_AI_KEY` lives in `.env`. The endpoint is read-only and returns only
  the current winner's public details.

## Showing the winner in a game (optional, untested)

The bot does not touch any game client. A game server can read `winner.txt` and tell
players at login. For an EQEmu quest script this idea looks like the following. It is
**untested**; try it on a development server first.

```lua
-- quests/global/global_player.lua
function event_connect(e)
  local f = io.open('/path/to/data/sotw/winner.txt', 'r')
  if f then
    local line = f:read('*l')
    f:close()
    if line and line ~= '' then
      e.self:Message(15, 'Student of the Week: ' .. line)
    end
  end
end
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `!sotw` does nothing | `SOTW_ENABLED=true` is missing, or restart the bot |
| Bot cannot post | Give its role access to the channels (step 1) |
| "That site is not on the allowed list" | Add the site to `SOTW_LINK_HOSTS` |
| `!sotw run` says no entries | Entries are grouped by ISO week in `SOTW_TIMEZONE` |
| "scoring failed" in the staff channel | Check `SOTW_AI_KEY`, `SOTW_AI_URL`, `SOTW_AI_MODEL`, or clear the key to use reactions only |
| Endpoint will not start | The port is in use; change `SOTW_HTTP_PORT` |

## Files

```
modules/student-of-the-week.js   commands, scheduler, Discord wiring
modules/sotw/                    screening, scoring, store, weekly cycle, publisher, config
test/sotw.test.js                offline tests
```
