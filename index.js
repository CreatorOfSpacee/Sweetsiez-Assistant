const express = require('express');
const axios = require('axios');
const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');

// Configuration
const config = {
  ROBLOX_COOKIE: process.env.ROBLOX_COOKIE, // Your .ROBLOSECURITY cookie
  GROUP_ID: process.env.GROUP_ID, // Your Roblox group ID
  DISCORD_TOKEN: process.env.DISCORD_TOKEN, // Your Discord bot token
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID, // Your Discord application ID
  PORT: process.env.PORT || 3000
};

// Express server for Replit to keep bot alive
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
  intents: [GatewayIntentBits.Guilds]
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
    // Get CSRF token
    const csrfResponse = await axios.post('https://auth.roblox.com/v1/login', {}, {
      headers: {
        'Cookie': `.ROBLOSECURITY=${config.ROBLOX_COOKIE}`
      },
      validateStatus: () => true
    });
    
    const csrfToken = csrfResponse.headers['x-csrf-token'];
    
    // Set the rank
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
    .setDescription('List all available ranks in the group')
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
    
  } catch (error) {
    console.error('Command error:', error);
    await interaction.editReply('❌ An error occurred while processing the command.');
  }
});

// Login to Discord
client.login(config.DISCORD_TOKEN);
