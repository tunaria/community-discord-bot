# Community Discord Bot

A Discord bot for a community game server, built on discord.js 14.

## What it does

- **Role panel:** posts a button panel in `#role-select` so members can add
  or remove roles. The role list is a JSON file (`ROLE_SELECT_FILE`); without
  one, a small example list is used.
- **Group tools:** `!raid schedule|list`, `!lfg`, `!boss`.
- **Help:** `!help` lists every command that is loaded.
- **Student of the Week (optional, off by default):** weekly community pick with a
  veto window and kill switch. See [docs/student-of-the-week.md](docs/student-of-the-week.md).

## How it is built

- `bot.js` starts the bot.
- `core.js` sets up the Discord client, reads settings, loads modules and
  routes messages, buttons and forms to them.
- `modules/` holds the commands. Every `.js` file there is loaded at startup.
- Optional private modules are loaded if present. They live in a `private/`
  folder that is not published and is maintained by the owner; it is ignored
  by git here, and without it the bot runs with the public modules only.

## Setup

```
npm ci
cp .env.example .env   # then fill it in
npm start
```

The bot needs the **Server Members** and **Message Content** privileged
intents, and Manage Roles in the server for the role panel.

## Settings (.env)

| Name | Needed | What it is |
| --- | --- | --- |
| `DISCORD_TOKEN` | yes | Bot token |
| `DISCORD_PREFIX` | no | Command prefix, default `!` |
| `DISCORD_GUILD_ID` | no | Server to set up panels in (default: first server) |
| `SERVER_NAME` | no | Name shown in titles |
| `ROLE_SELECT_FILE` | no | JSON file describing the role panel |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).
