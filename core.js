// Bot core: client setup, settings, the module loader and the shared helpers.
//
// Commands live in modules. Every .js file directly inside modules/ (public)
// and private/ (kept out of the public copy) is loaded at startup. A module
// exports register(bot, ctx) and uses bot.command(), bot.button(), bot.modal(),
// bot.messageHook(), bot.onReady() and bot.help() to plug in. When private/ is
// missing the bot runs with the public modules only.
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MODULE_DIRS = ['modules', 'private'];

const list = v => (v || '').split(',').map(x => x.trim()).filter(Boolean);

// First non-empty value among the given environment variable names.
// Later names are older spellings kept so existing .env files keep working.
function env(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}

// config.json is an optional fallback for older installs; .env wins.
function readFileConfig(root = ROOT) {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8')); } catch (e) { return {}; }
}

function createRegistry() {
  const registry = {
    commands: new Map(),
    buttons: new Map(),
    modals: new Map(),
    messageHooks: [],
    readyHooks: [],
    help: [],
    modules: [],
  };
  const add = (map, kind, key, fn) => {
    if (map.has(key)) throw new Error(`${kind} "${key}" is registered twice`);
    map.set(key, fn);
  };
  registry.api = {
    command: (name, fn) => add(registry.commands, 'command', name.toLowerCase(), fn),
    button: (id, fn) => add(registry.buttons, 'button', id, fn),
    modal: (id, fn) => add(registry.modals, 'modal', id, fn),
    // A message hook runs before command parsing; returning true stops further handling.
    messageHook: fn => registry.messageHooks.push(fn),
    onReady: fn => registry.readyHooks.push(fn),
    // One line in the !help embed. Sections sort by sectionOrder, lines by order.
    help: (section, sectionOrder, order, text) => registry.help.push({ section, sectionOrder, order, text }),
  };
  return registry;
}

// Load every module file in modules/ then private/ (when present), in name order.
function loadModules(registry, ctx, root = ROOT, dirs = MODULE_DIRS) {
  for (const dir of dirs) {
    const full = path.join(root, dir);
    if (!fs.existsSync(full)) continue;
    const files = fs.readdirSync(full, { withFileTypes: true })
      .filter(f => f.isFile() && f.name.endsWith('.js'))
      .map(f => f.name)
      .sort();
    for (const file of files) {
      const mod = require(path.join(full, file));
      if (typeof mod.register !== 'function') throw new Error(`${dir}/${file} does not export register()`);
      mod.register(registry.api, ctx);
      registry.modules.push(`${dir}/${file}`);
    }
  }
  return registry;
}

function buildHelpEmbed(registry, serverName) {
  const sections = new Map();
  for (const h of registry.help) {
    if (!sections.has(h.section)) sections.set(h.section, { order: h.sectionOrder, lines: [] });
    sections.get(h.section).lines.push(h);
  }
  const fields = [...sections.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([name, s]) => ({ name, value: s.lines.sort((a, b) => a.order - b.order).map(l => l.text).join('\n') }));
  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle(`🤖 ${serverName} Bot Commands`);
  if (fields.length) embed.addFields(...fields);
  return embed.setFooter({ text: `${serverName} Discord Bot` });
}

// Helpers shared by modules.
function makeHelpers(client, config) {
  const findGuild = () => (config.guildId
    ? (client.guilds.cache.get(config.guildId) || client.guilds.cache.first())
    : client.guilds.cache.first());

  // Delete the last 10 messages in a panel channel before reposting the panel.
  // Messages older than 14 days cannot be bulk deleted, so those go one by one.
  async function clearPanel(channel) {
    const messages = await channel.messages.fetch({ limit: 10 });
    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const toBulkDelete = messages.filter(msg => msg.createdTimestamp > fourteenDaysAgo);
    const toDeleteIndividually = messages.filter(msg => msg.createdTimestamp <= fourteenDaysAgo);
    if (toBulkDelete.size > 0) await channel.bulkDelete(toBulkDelete);
    for (const [, msg] of toDeleteIndividually) {
      try {
        await msg.delete();
      } catch (err) {
        console.error(`Failed to delete message ${msg.id}:`, err);
      }
    }
  }
  return { findGuild, clearPanel };
}

function createBot({ root = ROOT, dirs = MODULE_DIRS, client } = {}) {
  const fileConfig = readFileConfig(root);
  const config = {
    token:   env('DISCORD_TOKEN') || fileConfig.token || '',
    prefix:  env('DISCORD_PREFIX') || fileConfig.prefix || '!',
    guildId: env('DISCORD_GUILD_ID') || fileConfig.guildId || '',
  };
  const serverName = env('SERVER_NAME') || 'Game Server';

  client = client || new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildModeration,
    ],
    // Never let user-supplied text ping @everyone, @here or roles.
    allowedMentions: { parse: ['users'], repliedUser: true },
  });

  const registry = createRegistry();
  const ctx = { client, config, fileConfig, serverName, root, env, list, ...makeHelpers(client, config) };

  registry.api.command('help', async message => {
    message.reply({ embeds: [buildHelpEmbed(registry, serverName)] });
  });

  loadModules(registry, ctx, root, dirs);

  async function handleInteraction(interaction) {
    if (interaction.isButton()) {
      const fn = registry.buttons.get(interaction.customId);
      if (fn) await fn(interaction, ctx);
    } else if (interaction.isModalSubmit()) {
      const fn = registry.modals.get(interaction.customId);
      if (fn) await fn(interaction, ctx);
    }
  }

  async function handleMessage(message) {
    if (message.author.bot || !message.guild || !message.member) return;
    for (const hook of registry.messageHooks) {
      if (await hook(message, ctx)) return;
    }
    if (!message.content.startsWith(config.prefix)) return;
    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const fn = registry.commands.get(command);
    if (fn) await fn(message, args, ctx);
  }

  client.once('ready', () => {
    console.log(`✅ Bot is online as ${client.user.tag}`);
    client.user.setActivity(serverName, { type: 'PLAYING' });
    for (const fn of registry.readyHooks) {
      Promise.resolve().then(() => fn(ctx)).catch(e => console.error('ready hook error', e));
    }
  });

  client.on('interactionCreate', async interaction => {
    try {
      await handleInteraction(interaction);
    } catch (e) {
      console.error('interaction error', e);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        interaction.reply({ content: '❌ Something went wrong.', ephemeral: true }).catch(() => {});
      }
    }
  });

  client.on('messageCreate', async message => {
    try {
      await handleMessage(message);
    } catch (e) {
      console.error('message error', e);
    }
  });

  return { client, config, ctx, registry, handleMessage, handleInteraction };
}

function start() {
  require('dotenv').config();
  process.on('unhandledRejection', e => console.error('unhandledRejection', e));
  const bot = createBot();
  if (!bot.config.token) {
    console.error('DISCORD_TOKEN is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
  console.log(`Loaded modules: ${bot.registry.modules.join(', ') || 'none'}`);
  bot.client.login(bot.config.token);
  return bot;
}

module.exports = { createBot, createRegistry, loadModules, buildHelpEmbed, env, list, start, MODULE_DIRS };
