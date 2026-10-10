// Group tools anyone can use: raid list, looking-for-group posts and boss timers.
const { EmbedBuilder } = require('discord.js');

function register(bot) {
  const raidSchedule = [];

  bot.command('raid', async (message, args) => {
    const subCommand = args[0]?.toLowerCase();

    if (subCommand === 'schedule') {
      const raidName = args.slice(1).join(' ').slice(0, 100);
      if (!raidName) return message.reply('❌ Usage: !raid schedule <raid name>');
      if (raidSchedule.length >= 25) return message.reply('❌ Raid list is full.');

      raidSchedule.push({ name: raidName, leader: message.author.tag, date: new Date() });
      message.reply(`✅ Raid scheduled: **${raidName}** by ${message.author.tag}`);
    } else if (subCommand === 'list') {
      if (raidSchedule.length === 0) {
        return message.reply('📅 No raids scheduled!');
      }

      const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('📅 Scheduled Raids')
        .setDescription(raidSchedule.map((r, i) => 
          `**${i + 1}.** ${r.name}\n*Leader: ${r.leader}*`
        ).join('\n\n').slice(0, 4000));

      message.reply({ embeds: [embed] });
    } else {
      message.reply('Usage: `!raid schedule <name>` or `!raid list`');
    }
  });

  bot.command('lfg', async (message, args) => {
    const classRole = (args.join(' ') || 'Any class').slice(0, 1000);
    
    const embed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('👥 Looking For Group')
      .setDescription(`${message.author} is looking for a group!`)
      .addFields(
        { name: 'Class', value: classRole, inline: true },
        { name: 'Level', value: 'Contact for details', inline: true }
      )
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  });

  bot.command('boss', async (message, args) => {
    const bossName = args.join(' ').slice(0, 200);
    if (!bossName) return message.reply('❌ Usage: !boss <boss name>');

    const respawnTime = Math.floor(Math.random() * 120) + 60; // 60-180 minutes
    
    const embed = new EmbedBuilder()
      .setColor('#e74c3c')
      .setTitle('⏰ Boss Timer')
      .setDescription(`**${bossName}**`)
      .addFields(
        { name: 'Estimated Respawn', value: `~${respawnTime} minutes`, inline: true },
        { name: 'Reported By', value: message.author.tag, inline: true }
      )
      .setTimestamp();

    message.reply({ embeds: [embed] });
  });

  const GAME = '**Game**';
  bot.help(GAME, 20, 20, '`!raid schedule <name>` - Schedule raid');
  bot.help(GAME, 20, 21, '`!raid list` - View raids');
  bot.help(GAME, 20, 30, '`!lfg [class]` - Looking for group');
  bot.help(GAME, 20, 40, '`!boss <name>` - Report boss timer');
}

module.exports = { register };
