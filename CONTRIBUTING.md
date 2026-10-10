# Contributing

Thanks for helping. Every change goes through a pull request and is reviewed
by the owner before it is merged. Nothing is deployed automatically.

## Setup

1. Fork the repository and clone your fork.
2. Install Node.js 20 or newer, then run `npm ci`.
3. Create your own test bot at https://discord.com/developers/applications,
   turn on the **Server Members** and **Message Content** intents, and invite it
   to your own test Discord server.
4. Copy `.env.example` to `.env` and fill in **your own** bot token and test
   settings. Never use the real server's token.
5. Run `npm start`.

## Adding a command

Put a new file in `modules/` that exports `register(bot, ctx)`. Inside it,
call `bot.command(name, fn)`, `bot.button(id, fn)`, `bot.modal(id, fn)`,
`bot.onReady(fn)` or `bot.help(section, sectionOrder, order, text)`. The
core loads every `.js` file in `modules/` at startup. See
`modules/group-tools.js` for a small example.

Contributors write public modules in `modules/`. Optional private modules are
loaded if present; they are maintained by the owner and are not part of this
repository, so do not depend on them.

## Before opening a pull request

- `npm run lint` and `npm test` pass.
- No secrets: no tokens, passwords, keys, private IP addresses, server
  hostnames or Discord server/channel/role IDs. Every setting goes in
  `.env.example` as a name with a placeholder value.
- No player data, chat logs, screenshots or message backups.
- Keep one change per pull request and describe how you tested it.
- Anything a regular member can trigger must cap its input lengths, must not
  ping @everyone or roles, and must not crash the bot when Discord rejects a
  call.
- Staff commands must check the caller's Discord permissions.

## Security problems

Do not open a public issue. See [SECURITY.md](SECURITY.md).
