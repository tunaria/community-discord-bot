const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const guildId = process.env.DISCORD_GUILD_ID;
if (!guildId || !process.env.DISCORD_TOKEN) {
  console.error('Set DISCORD_TOKEN and DISCORD_GUILD_ID in .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

client.once('ready', async () => {
  console.log(`LoggedIn as ${client.user.tag}`);
  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      console.error(`Guild ${guildId} not found!`);
      process.exit(1);
    }
    console.log(`Guild Name: ${guild.name} (ID: ${guild.id})`);

    const channels = await guild.channels.fetch();

    const categories = new Map();
    const uncategorized = [];

    channels.forEach(ch => {
      if (!ch) return;
      if (ch.type === 4) { // GuildCategory
        if (!categories.has(ch.id)) {
          categories.set(ch.id, { name: ch.name, id: ch.id, channels: [] });
        }
      }
    });

    channels.forEach(ch => {
      if (!ch || ch.type === 4) return; // Skip category channels themselves
      const item = { name: ch.name, id: ch.id, type: ch.type };
      if (ch.parentId && categories.has(ch.parentId)) {
        categories.get(ch.parentId).channels.push(item);
      } else {
        uncategorized.push(item);
      }
    });

    console.log('\n--- CATEGORIES & CHANNELS ---');
    for (const [catId, cat] of categories) {
      console.log(`\n📁 Category: "${cat.name}" (ID: ${catId})`);
      cat.channels.forEach(c => {
        console.log(`   - [#${c.name}] (Type: ${c.type}, ID: ${c.id})`);
      });
    }

    if (uncategorized.length > 0) {
      console.log('\n📁 Uncategorized Channels:');
      uncategorized.forEach(c => {
        console.log(`   - [#${c.name}] (Type: ${c.type}, ID: ${c.id})`);
      });
    }

  } catch (err) {
    console.error('Error fetching guild channels:', err);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(process.env.DISCORD_TOKEN);

