// Student of the Week: members submit work, the bot screens and scores it, staff get a veto
// window, then the winner is announced and published. Off unless SOTW_ENABLED=true.
// Setup guide: docs/student-of-the-week.md
const path = require('path');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { buildConfig } = require('./sotw/config');
const { screenEntry, cleanText } = require('./sotw/screening');
const { Store } = require('./sotw/store');
const { Engine } = require('./sotw/engine');
const { Publisher } = require('./sotw/publisher');
const { ReactionScorer, AIScorer, flaggedByModeration } = require('./sotw/ai');

const DAY_MS = 86400000;
const THUMBS_UP = '👍';
const SUBMIT_COOLDOWN_MS = 15000;
const NO_PINGS = { parse: [] };

function register(bot, ctx) {
  const cfg = buildConfig(ctx.env, ctx.root || path.join(__dirname, '..'));
  if (!cfg.enabled) return;

  const store = new Store(path.join(cfg.dataDir, 'sotw.json'));
  const publisher = new Publisher(cfg);
  const scorer = cfg.aiKey ? new AIScorer(cfg) : new ReactionScorer();
  const prefix = ctx.config.prefix;
  const lastSubmit = new Map();

  const channelFor = { staff: cfg.staffChannel, announce: cfg.announceChannel, hall: cfg.hallChannel };

  async function fetchChannel(id) {
    if (!id) return null;
    try { return await ctx.client.channels.fetch(id); } catch (e) { return null; }
  }

  async function notify(kind, text) {
    const channel = await fetchChannel(channelFor[kind]);
    if (!channel) return;
    try {
      await channel.send({ content: text.slice(0, 1900), allowedMentions: NO_PINGS });
    } catch (e) {
      console.error(`Student of the Week: could not post to the ${kind} channel`, e.message);
    }
  }

  async function countReactions(entry) {
    try {
      const channel = await fetchChannel(entry.channelId);
      const message = channel && await channel.messages.fetch(entry.messageId);
      const reaction = message && message.reactions.cache.get(THUMBS_UP);
      return reaction ? Math.max(0, reaction.count - (reaction.me ? 1 : 0)) : 0;
    } catch (e) {
      return 0;
    }
  }

  const engine = new Engine({ cfg, store, scorer, publisher, notify, reactionCounter: countReactions });

  const isStaff = m => Boolean(m.member && m.member.permissions.has(PermissionFlagsBits.ManageGuild));
  const nameOf = m => cleanText((m.member && m.member.displayName) || m.author.username || m.author.tag, 32) || 'Member';

  async function submit(message, args) {
    const [head, ...rest] = args.join(' ').split('|');
    const [url, ...titleWords] = head.trim().split(/\s+/);
    const usage = `Usage: \`${prefix}sotw submit <link> <title> | <description>\``;
    if (!url || !titleWords.length || !rest.length) return message.reply(`❌ ${usage}`);

    const userId = message.author.id;
    if (store.isOptout(userId)) return message.reply(`❌ You have opted out. Use \`${prefix}sotw optin\` to enter again.`);
    const since = lastSubmit.get(userId) || 0;
    if (Date.now() - since < SUBMIT_COOLDOWN_MS) return message.reply('❌ Please wait a few seconds before submitting again.');

    const accountAge = (Date.now() - message.author.createdTimestamp) / DAY_MS;
    const memberAge = (Date.now() - message.member.joinedTimestamp) / DAY_MS;
    if (!(accountAge >= cfg.minAccountDays)) return message.reply('❌ Your Discord account is too new to enter.');
    if (!(memberAge >= cfg.minMemberDays)) return message.reply('❌ You need to be in the server a little longer before entering.');

    const week = engine.currentWeek();
    if (store.countUserWeek(userId, week) >= cfg.maxPerWeek) {
      return message.reply(`❌ You can enter up to ${cfg.maxPerWeek} times a week.`);
    }
    const screened = screenEntry(titleWords.join(' '), url, rest.join('|'), cfg);
    if (screened.error) return message.reply(`❌ ${screened.error}`);
    const { title, url: cleanUrl, description } = screened.entry;
    if (store.urlUsed(cleanUrl)) return message.reply('❌ That link has already been submitted.');
    lastSubmit.set(userId, Date.now());
    if (await flaggedByModeration(cfg, `${title}\n${description}`)) {
      return message.reply('❌ Your entry could not be accepted.');
    }

    const entry = store.addEntry({ week, userId, author: nameOf(message), title, url: cleanUrl, description });
    const embed = new EmbedBuilder()
      .setColor('#f1c40f')
      .setTitle(`🎓 Entry #${entry.id}: ${title}`.slice(0, 256))
      .setDescription(description)
      .addFields({ name: 'Link', value: cleanUrl.slice(0, 1000) }, { name: 'By', value: entry.author })
      .setFooter({ text: `React ${THUMBS_UP} to vote` });
    const target = (await fetchChannel(cfg.submitChannel)) || message.channel;
    try {
      const posted = await target.send({ embeds: [embed], allowedMentions: NO_PINGS });
      store.setEntryMessage(entry.id, target.id, posted.id);
      if (typeof posted.react === 'function') await posted.react(THUMBS_UP);
    } catch (e) {
      console.error('Student of the Week: could not post the entry', e.message);
    }
    return message.reply(`✅ Entry #${entry.id} received. Good luck!`);
  }

  function showWinner(message) {
    const w = store.liveWinner();
    if (!w) return message.reply('No Student of the Week is featured right now.');
    return message.reply({ content: `🎓 Student of the Week: **${w.title}** by ${w.author}\n${w.url}`, allowedMentions: NO_PINGS });
  }

  const staffOnly = {
    async status(message) {
      const pending = store.pendingWinner();
      const live = store.liveWinner();
      return message.reply([
        `Week: ${engine.currentWeek()}`,
        `Paused: ${store.isPaused() ? 'yes' : 'no'}`,
        `Live: ${live ? `"${live.title}" by ${live.author}` : 'none'}`,
        `Pending: ${pending ? `"${pending.title}" by ${pending.author}, goes live ${pending.publishAt}` : 'none'}`,
        `Entries this week: ${store.validEntries(engine.currentWeek()).length}`,
      ].join('\n'));
    },
    async run(message) { return message.reply(`✅ ${await engine.runCycle()}`); },
    async veto(message) { return message.reply(`✅ ${await engine.veto()}`); },
    async revert(message) {
      engine.revert();
      return message.reply('✅ Winner cleared and the weekly cycle is paused. Use resume to start it again.');
    },
    async resume(message) { engine.resume(); return message.reply('✅ The weekly cycle is running again.'); },
  };

  bot.command('sotw', async (message, args) => {
    const sub = (args.shift() || '').toLowerCase();
    const userId = message.author.id;

    if (sub === 'submit') return submit(message, args);
    if (sub === 'winner') return showWinner(message);
    if (sub === 'mine') {
      const mine = store.userEntries(userId, engine.currentWeek());
      if (!mine.length) return message.reply('You have no entries this week.');
      return message.reply(mine.map(e => `#${e.id} ${e.title} (${e.status})`).join('\n').slice(0, 1900));
    }
    if (sub === 'withdraw') {
      const id = Number(args[0]);
      if (!Number.isInteger(id)) return message.reply(`Usage: \`${prefix}sotw withdraw <entry number>\``);
      return message.reply(store.withdrawEntry(id, userId) ? '✅ Entry withdrawn.' : '❌ No open entry of yours with that number.');
    }
    if (sub === 'optout') {
      store.addOptout(userId);
      store.removeUserEntries(userId);
      return message.reply('✅ You will not be featured, and your open entries were removed.');
    }
    if (sub === 'optin') { store.removeOptout(userId); return message.reply('✅ You can enter again.'); }

    if (Object.hasOwn(staffOnly, sub)) {
      if (!isStaff(message)) return message.reply('❌ You need the Manage Server permission for that.');
      return staffOnly[sub](message);
    }
    return message.reply(`Usage: \`${prefix}sotw submit|mine|withdraw|winner|optout|optin\``);
  });

  bot.command('student', showWinner);

  bot.onReady(async () => {
    try { engine.restorePublished(); } catch (e) { console.error('Student of the Week: could not write winner files', e.message); }
    if (cfg.httpPort > 0) {
      try {
        await publisher.startHttp();
        console.log(`Student of the Week endpoint on ${cfg.httpHost}:${cfg.httpPort}`);
      } catch (e) {
        console.error('Student of the Week: endpoint failed to start', e.message);
      }
    }
    const tick = async () => {
      try {
        if (engine.cycleDue()) await engine.runCycle();
        await engine.publishDue();
      } catch (e) {
        console.error('Student of the Week tick failed', e);
      }
    };
    setInterval(tick, 60000).unref();
  });

  const S = '**Student of the Week**';
  bot.help(S, 30, 10, '`!sotw submit <link> <title> | <description>` - Enter this week');
  bot.help(S, 30, 20, '`!sotw mine` / `!sotw withdraw <number>` - Your entries');
  bot.help(S, 30, 30, '`!student` - Show the current winner');
  bot.help(S, 30, 40, '`!sotw optout` / `!sotw optin` - Never / again be featured');
}

module.exports = { register };
