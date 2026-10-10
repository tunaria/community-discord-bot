// Role panel: posts buttons in #role-select so members can add or remove roles.
//
// The role list comes from ROLE_SELECT_FILE, else private/roles.json when it
// exists, else the small example list below. The file holds
// { fields: [{name, value}], rows: [[{id, label, style}]], roles: {id: roleName} };
// a button id with no entry in roles (role_remove_all) removes every listed role.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const EXAMPLE_ROLES = {
  fields: [
    { name: '🛡️ Tanks', value: 'Front line defenders' },
    { name: '✨ Healers', value: 'Keep the group alive' },
    { name: '⚔️ Damage', value: 'Bring the enemy down' },
    { name: '🎵 Support', value: 'Buffs and crowd control' },
  ],
  rows: [[
    { id: 'role_tank', label: '🛡️ Tank', style: 'Primary' },
    { id: 'role_healer', label: '✨ Healer', style: 'Success' },
    { id: 'role_damage', label: '⚔️ Damage', style: 'Danger' },
    { id: 'role_support', label: '🎵 Support', style: 'Secondary' },
    { id: 'role_remove_all', label: '❌ Remove All', style: 'Danger' },
  ]],
  roles: { role_tank: 'Tanks', role_healer: 'Healers', role_damage: 'Damage', role_support: 'Support' },
};

function loadRoleData(ctx) {
  const candidates = [ctx.env('ROLE_SELECT_FILE'), path.join('private', 'roles.json')].filter(Boolean);
  for (const c of candidates) {
    const file = path.resolve(ctx.root, c);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return EXAMPLE_ROLES;
}

function register(bot, ctx) {
  const data = loadRoleData(ctx);
  const roleMap = data.roles;
  const serverName = ctx.serverName;

  bot.onReady(async () => {
    try {
      const guild = ctx.findGuild();
      if (!guild) return;

      const channel = guild.channels.cache.find(ch => ch.name === 'role-select');
      if (!channel) {
        console.log('⚠️  #role-select channel not found. Please create it!');
        return;
      }

      await ctx.clearPanel(channel);

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle(`🎮 ${serverName} - Role Selection`)
        .setDescription('Click the buttons below to get your class roles!\n\n**Available Roles:**')
        .addFields(...data.fields.map(f => ({ name: f.name, value: f.value, inline: true })))
        .setFooter({ text: 'Click multiple buttons to get multiple roles!' });

      // Discord allows max 5 buttons per row, 5 rows max.
      const rows = data.rows.map(row => new ActionRowBuilder().addComponents(
        ...row.map(b => new ButtonBuilder().setCustomId(b.id).setLabel(b.label).setStyle(ButtonStyle[b.style]))
      ));

      await channel.send({ embeds: [embed], components: rows });
      console.log('✅ Role selection setup complete!');
    } catch (error) {
      console.error('Error setting up role selection:', error);
    }
  });

  bot.button('role_remove_all', async interaction => {
    const rolesToRemove = Object.values(roleMap);
    const removed = [];

    // Fetch all roles from the API to make sure the cache is complete.
    let roles;
    try {
      roles = await interaction.guild.roles.fetch();
    } catch (err) {
      console.error('Error pre-fetching roles for removal:', err);
      roles = interaction.guild.roles.cache;
    }

    for (const roleName of rolesToRemove) {
      const role = roles.find(r => r.name === roleName);
      if (role && interaction.member.roles.cache.has(role.id)) {
        await interaction.member.roles.remove(role);
        removed.push(roleName);
      }
    }

    await interaction.reply({
      content: removed.length > 0 ? `✅ Removed roles: ${removed.join(', ')}` : '❌ You have no roles to remove!',
      ephemeral: true
    });
  });

  for (const [id, roleName] of Object.entries(roleMap)) {
    bot.button(id, async interaction => {
      // Find or fetch the role to avoid partial cache issues.
      let role = interaction.guild.roles.cache.find(r => r.name === roleName);
      if (!role) {
        try {
          const fetchedRoles = await interaction.guild.roles.fetch();
          role = fetchedRoles.find(r => r.name === roleName);
        } catch (err) {
          console.error('Error fetching role dynamically:', err);
        }
      }

      if (!role) {
        await interaction.reply({
          content: `❌ Role "${roleName}" not found! Please ask an admin to create it.`,
          ephemeral: true
        });
        return;
      }

      if (interaction.member.roles.cache.has(role.id)) {
        await interaction.member.roles.remove(role);
        await interaction.reply({ content: `✅ Removed role: ${roleName}`, ephemeral: true });
      } else {
        await interaction.member.roles.add(role);
        await interaction.reply({ content: `✅ Added role: ${roleName}`, ephemeral: true });
      }
    });
  }

  bot.help('**Roles**', 30, 0, 'Visit #role-select to get class roles!');
}

module.exports = { register, EXAMPLE_ROLES };
