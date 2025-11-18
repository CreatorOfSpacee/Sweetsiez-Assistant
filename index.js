const express = require('express');
const axios = require('axios');
const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');

// Configuration
const config = {
  ROBLOX_COOKIE: process.env.ROBLOX_COOKIE,
  GROUP_ID: process.env.GROUP_ID,
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  PORT: process.env.PORT || 3000
};

// Role bindings - Map Roblox rank numbers to Discord role names
// Edit this to match your group's ranks and desired Discord roles
const ROLE_BINDS = {
  1: ['Verified', 'Sweetsiez Supporter'],
  2: ['Verified', 'Noted Customer'],
  3: ['Verified', 'Allied Representative'],
  4: ['Verified','Trainee'],
  5: ['Verified','Junior Barista', 'LR Team'],
  6: ['Verified', 'Barista', 'LR Team'],
  7: ['Verified', 'Senior Barista', 'LR Team'],
  8: ['Verified', 'Staff Assistant', 'LR Team'],
  9: ['Verified', 'Assistant Supervisor', 'MR Team','Low Response'],
  10: ['Verified', 'Supervisor', 'MR Team','Low Response','Hosting'],
  11: ['Verified', 'Assistant Manager', 'MR Team','Low Response','Medium Response','Hosting','LR Ranking'],
  12: ['Verified', 'General Manager', 'MR Team','Low Response','Medium Response','Hosting','LR Ranking','Pbanning'],
  13: ['Verified', 'Executive Assistant', 'HR Team','High Response','Hosting','LR Ranking','Pbanning'],
  14: ['Verified', 'Public Relations Director', 'HR Team','High Response','Pbanning','Public Relations'],
  15: ['Verified', 'Human Resources Director', 'HR Team','High Response','Pbanning','Human Resources'],
  16: ['Verified', 'Managing Director', 'HR Team','High Response','Pbanning'],
  17: ['Verified', 'Developer', 'Development Team'],
  18: ['Verified', 'Executive Director', 'HR Team','Executive Team','High Response','Pbanning'],
  19: ['Verified', 'Vice President','Executive Team','Leadership Team'],
  20: ['Verified', 'President','Executive Team','Leadership Team'],
  20: ['Verified', 'Vice Chairperson','Executive Team','Leadership Team'],
  21: ['Verified', 'Chairperson','Executive Team','Leadership Team'],
  255: ['Verified', 'Group Holder','Executive Team','Leadership Team'],
};

// Express server
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Roblox Ranking Bot is running!');
});

app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
});

// Discord Bot Setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// Roblox API Helper Functions
async function getRobloxUserId(username) {
  try {
    const response = await axios.post('https://users.roblox.com/v1/usernames/users', {
      usernames: [username]
    });
    
    if (response.data.data && response.data.data.length > 0) {
      return response.data.data[0].id;
    }
    return null;
  } catch (error) {
    console.error('Error getting user ID:', error.message);
    return null;
  }
}

async function getUserRankInGroup(userId) {
  try {
    const response = await axios.get(`https://groups.roblox.com/v1/users/${userId}/groups/roles`);
    const groupData = response.data.data.find(g => g.group.id === parseInt(config.GROUP_ID));
    
    if (groupData) {
      return {
        rank: groupData.role.rank,
        name: groupData.role.name,
        id: groupData.role.id
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting user rank:', error.message);
    return null;
  }
}

async function getGroupRoles() {
  try {
    const response = await axios.get(`https://groups.roblox.com/v1/groups/${config.GROUP_ID}/roles`, {
      headers: {
        'Cookie': `.ROBLOSECURITY=${config.ROBLOX_COOKIE}`
      }
    });
    return response.data.roles;
  } catch (error) {
    console.error('Error getting group roles:', error.message);
    return null;
  }
}

async function setUserRank(userId, roleId) {
  try {
    const csrfResponse = await axios.post('https://auth.roblox.com/v1/login', {}, {
      headers: {
        'Cookie': `.ROBLOSECURITY=${config.ROBLOX_COOKIE}`
      },
      validateStatus: () => true
    });
    
    const csrfToken = csrfResponse.headers['x-csrf-token'];
    
    const response = await axios.patch(
      `https://groups.roblox.com/v1/groups/${config.GROUP_ID}/users/${userId}`,
      { roleId: roleId },
      {
        headers: {
          'Cookie': `.ROBLOSECURITY=${config.ROBLOX_COOKIE}`,
          'X-CSRF-TOKEN': csrfToken,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.status === 200;
  } catch (error) {
    console.error('Error setting rank:', error.message);
    return false;
  }
}

// Discord Role Management Functions
async function updateDiscordRoles(member, robloxRank) {
  try {
    const guild = member.guild;
    const rolesToGive = ROLE_BINDS[robloxRank] || [];
    
    // Get all Discord roles that match the role bind names
    const discordRolesToAdd = [];
    for (const roleName of rolesToGive) {
      const role = guild.roles.cache.find(r => r.name === roleName);
      if (role) {
        discordRolesToAdd.push(role);
      }
    }
    
    // Get all roles from role binds to know which ones to remove
    const allBoundRoleNames = new Set();
    Object.values(ROLE_BINDS).forEach(roles => {
      roles.forEach(roleName => allBoundRoleNames.add(roleName));
    });
    
    const discordRolesToRemove = [];
    member.roles.cache.forEach(role => {
      if (allBoundRoleNames.has(role.name) && !rolesToGive.includes(role.name)) {
        discordRolesToRemove.push(role);
      }
    });
    
    // Remove old rank roles
    if (discordRolesToRemove.length > 0) {
      await member.roles.remove(discordRolesToRemove);
    }
    
    // Add new rank roles
    if (discordRolesToAdd.length > 0) {
      await member.roles.add(discordRolesToAdd);
    }
    
    return {
      added: discordRolesToAdd.map(r => r.name),
      removed: discordRolesToRemove.map(r => r.name)
    };
  } catch (error) {
    console.error('Error updating Discord roles:', error.message);
    return null;
  }
}

// Discord Commands
const commands = [
  new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Promote a user in the Roblox group')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Roblox username')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('demote')
    .setDescription('Demote a user in the Roblox group')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Roblox username')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('setrank')
    .setDescription('Set a user to a specific rank')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Roblox username')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('rank')
        .setDescription('Rank number (0-255)')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('getrank')
    .setDescription('Get a user\'s current rank')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Roblox username')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('ranks')
    .setDescription('List all available ranks in the group'),
  
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your Roblox account and get roles')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Your Roblox username')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('update')
    .setDescription('Update Discord roles for a verified user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Discord user to update')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('binds')
    .setDescription('View all role bindings'),
  
  new SlashCommandBuilder()
    .setName('verifyall')
    .setDescription('Update roles for all members with verified Roblox accounts (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

// Register slash commands
const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(config.DISCORD_CLIENT_ID),
      { body: commands.map(cmd => cmd.toJSON()) }
    );
    console.log('Slash commands registered!');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
})();

// Bot event handlers
client.once('ready', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  client.user.setActivity('Roblox Groups', { type: 'WATCHING' });
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  await interaction.deferReply();

  try {
    if (commandName === 'promote') {
      const username = interaction.options.getString('username');
      const userId = await getRobloxUserId(username);
      
      if (!userId) {
        return interaction.editReply('❌ User not found!');
      }
      
      const currentRank = await getUserRankInGroup(userId);
      if (!currentRank) {
        return interaction.editReply('❌ User is not in the group!');
      }
      
      const roles = await getGroupRoles();
      const nextRole = roles.find(r => r.rank === currentRank.rank + 1);
      
      if (!nextRole) {
        return interaction.editReply('❌ User is already at max rank!');
      }
      
      const success = await setUserRank(userId, nextRole.id);
      
      if (success) {
        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✅ User Promoted')
          .addFields(
            { name: 'Username', value: username, inline: true },
            { name: 'Old Rank', value: currentRank.name, inline: true },
            { name: 'New Rank', value: nextRole.name, inline: true }
          )
          .setTimestamp();
        
        return interaction.editReply({ embeds: [embed] });
      } else {
        return interaction.editReply('❌ Failed to promote user. Check bot permissions.');
      }
    }
    
    else if (commandName === 'demote') {
      const username = interaction.options.getString('username');
      const userId = await getRobloxUserId(username);
      
      if (!userId) {
        return interaction.editReply('❌ User not found!');
      }
      
      const currentRank = await getUserRankInGroup(userId);
      if (!currentRank) {
        return interaction.editReply('❌ User is not in the group!');
      }
      
      const roles = await getGroupRoles();
      const previousRole = roles.find(r => r.rank === currentRank.rank - 1);
      
      if (!previousRole) {
        return interaction.editReply('❌ User is already at lowest rank!');
      }
      
      const success = await setUserRank(userId, previousRole.id);
      
      if (success) {
        const embed = new EmbedBuilder()
          .setColor(0xff9900)
          .setTitle('⬇️ User Demoted')
          .addFields(
            { name: 'Username', value: username, inline: true },
            { name: 'Old Rank', value: currentRank.name, inline: true },
            { name: 'New Rank', value: previousRole.name, inline: true }
          )
          .setTimestamp();
        
        return interaction.editReply({ embeds: [embed] });
      } else {
        return interaction.editReply('❌ Failed to demote user. Check bot permissions.');
      }
    }
    
    else if (commandName === 'setrank') {
      const username = interaction.options.getString('username');
      const targetRank = interaction.options.getInteger('rank');
      const userId = await getRobloxUserId(username);
      
      if (!userId) {
        return interaction.editReply('❌ User not found!');
      }
      
      const currentRank = await getUserRankInGroup(userId);
      if (!currentRank) {
        return interaction.editReply('❌ User is not in the group!');
      }
      
      const roles = await getGroupRoles();
      const targetRole = roles.find(r => r.rank === targetRank);
      
      if (!targetRole) {
        return interaction.editReply('❌ Invalid rank number!');
      }
      
      const success = await setUserRank(userId, targetRole.id);
      
      if (success) {
        const embed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle('✅ Rank Set')
          .addFields(
            { name: 'Username', value: username, inline: true },
            { name: 'Old Rank', value: currentRank.name, inline: true },
            { name: 'New Rank', value: targetRole.name, inline: true }
          )
          .setTimestamp();
        
        return interaction.editReply({ embeds: [embed] });
      } else {
        return interaction.editReply('❌ Failed to set rank. Check bot permissions.');
      }
    }
    
    else if (commandName === 'getrank') {
      const username = interaction.options.getString('username');
      const userId = await getRobloxUserId(username);
      
      if (!userId) {
        return interaction.editReply('❌ User not found!');
      }
      
      const currentRank = await getUserRankInGroup(userId);
      
      if (!currentRank) {
        return interaction.editReply('❌ User is not in the group!');
      }
      
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('📊 User Rank Info')
        .addFields(
          { name: 'Username', value: username, inline: true },
          { name: 'Rank', value: `${currentRank.rank}`, inline: true },
          { name: 'Role', value: currentRank.name, inline: true }
        )
        .setTimestamp();
      
      return interaction.editReply({ embeds: [embed] });
    }
    
    else if (commandName === 'ranks') {
      const roles = await getGroupRoles();
      
      if (!roles) {
        return interaction.editReply('❌ Failed to fetch roles!');
      }
      
      const roleList = roles
        .sort((a, b) => b.rank - a.rank)
        .map(role => `**${role.rank}** - ${role.name}`)
        .join('\n');
      
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('📋 Group Ranks')
        .setDescription(roleList)
        .setTimestamp();
      
      return interaction.editReply({ embeds: [embed] });
    }
    
    else if (commandName === 'verify') {
      const username = interaction.options.getString('username');
      const userId = await getRobloxUserId(username);
      
      if (!userId) {
        return interaction.editReply('❌ Roblox user not found!');
      }
      
      const currentRank = await getUserRankInGroup(userId);
      
      if (!currentRank) {
        return interaction.editReply('❌ User is not in the group! Please join the group first.');
      }
      
      const member = interaction.member;
      const roleUpdate = await updateDiscordRoles(member, currentRank.rank);
      
      if (!roleUpdate) {
        return interaction.editReply('❌ Failed to update roles. Make sure the bot has Manage Roles permission and its role is above the roles it needs to assign.');
      }
      
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Verified Successfully!')
        .addFields(
          { name: 'Roblox Username', value: username, inline: true },
          { name: 'Group Rank', value: `${currentRank.name} (${currentRank.rank})`, inline: true }
        )
        .setTimestamp();
      
      if (roleUpdate.added.length > 0) {
        embed.addFields({ name: 'Roles Added', value: roleUpdate.added.join(', '), inline: false });
      }
      
      if (roleUpdate.removed.length > 0) {
        embed.addFields({ name: 'Roles Removed', value: roleUpdate.removed.join(', '), inline: false });
      }
      
      return interaction.editReply({ embeds: [embed] });
    }
    
    else if (commandName === 'update') {
      const targetUser = interaction.options.getUser('user');
      const member = await interaction.guild.members.fetch(targetUser.id);
      
      // For simplicity, we'll need them to provide username again
      // In a full implementation, you'd store Discord ID -> Roblox Username mappings
      return interaction.editReply('❌ This command is under development. For now, ask the user to run `/verify` with their Roblox username.');
    }
    
    else if (commandName === 'binds') {
      const bindsList = Object.entries(ROLE_BINDS)
        .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
        .map(([rank, roles]) => `**Rank ${rank}:** ${roles.join(', ')}`)
        .join('\n');
      
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('📋 Role Bindings')
        .setDescription(bindsList || 'No role bindings configured.')
        .setFooter({ text: 'Users at these ranks will receive the corresponding Discord roles' })
        .setTimestamp();
      
      return interaction.editReply({ embeds: [embed] });
    }
    
    else if (commandName === 'verifyall') {
      return interaction.editReply('❌ This command is under development. It will update all members\' roles based on their Roblox ranks.');
    }
    
  } catch (error) {
    console.error('Command error:', error);
    await interaction.editReply('❌ An error occurred while processing the command.');
  }
});

// Login to Discord
client.login(config.DISCORD_TOKEN);
