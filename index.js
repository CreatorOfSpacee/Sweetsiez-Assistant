const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');

// Configuration
const config = {
  ROBLOX_COOKIE: process.env.ROBLOX_COOKIE,
  GROUP_ID: process.env.GROUP_ID,
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  RANKING_LOG_CHANNEL_ID: process.env.RANKING_LOG_CHANNEL_ID,
  MIN_RANK_TO_USE_COMMANDS: parseInt(process.env.MIN_RANK_TO_USE_COMMANDS || '9'),
  PORT: process.env.PORT || 3000
};

// File path for storing verified users
const VERIFIED_USERS_FILE = path.join(__dirname, 'verified_users.json');

// Role bindings - Map Roblox rank numbers to Discord role names
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
  21: ['Verified', 'Vice Chairperson','Executive Team','Leadership Team'],
  22: ['Verified', 'Chairperson','Executive Team','Leadership Team'],
  255: ['Verified', 'Group Holder','Executive Team','Leadership Team'],
};

// Store verified users (Discord ID -> Roblox Username)
const verifiedUsers = new Map();

// Store pending verifications (Discord ID -> {username, code})
const pendingVerifications = new Map();

// Load verified users from file
async function loadVerifiedUsers() {
  try {
    const data = await fs.readFile(VERIFIED_USERS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    Object.entries(parsed).forEach(([key, value]) => {
      verifiedUsers.set(key, value);
    });
    console.log(`✅ Loaded ${verifiedUsers.size} verified users from file`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('📝 No existing verified users file found, starting fresh');
    } else {
      console.error('Error loading verified users:', error.message);
    }
  }
}

// Save verified users to file
async function saveVerifiedUsers() {
  try {
    const obj = Object.fromEntries(verifiedUsers);
    await fs.writeFile(VERIFIED_USERS_FILE, JSON.stringify(obj, null, 2), 'utf8');
    console.log(`💾 Saved ${verifiedUsers.size} verified users to file`);
  } catch (error) {
    console.error('Error saving verified users:', error.message);
  }
}

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

async function getRobloxUserInfo(userId) {
  try {
    const response = await axios.get(`https://users.roblox.com/v1/users/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Error getting user info:', error.message);
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

// Generate random verification code
function generateVerificationCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Check if user's Roblox bio contains the verification code
async function checkVerificationCode(userId, code) {
  try {
    const userInfo = await getRobloxUserInfo(userId);
    if (!userInfo || !userInfo.description) {
      return false;
    }
    return userInfo.description.includes(code);
  } catch (error) {
    console.error('Error checking verification code:', error.message);
    return false;
  }
}

// Discord Role Management Functions
async function updateDiscordRoles(member, robloxRank) {
  try {
    const guild = member.guild;
    const rolesToGive = ROLE_BINDS[robloxRank] || [];
    
    const discordRolesToAdd = [];
    for (const roleName of rolesToGive) {
      const role = guild.roles.cache.find(r => r.name === roleName);
      if (role) {
        discordRolesToAdd.push(role);
      }
    }
    
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
    
    if (discordRolesToRemove.length > 0) {
      await member.roles.remove(discordRolesToRemove);
    }
    
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

// Log ranking action to Discord channel
async function logRankingAction(guild, rankerUsername, targetUsername, oldRank, newRank, action) {
  if (!config.RANKING_LOG_CHANNEL_ID) return;
  
  try {
    const channel = await guild.channels.fetch(config.RANKING_LOG_CHANNEL_ID);
    if (!channel) return;
    
    const embed = new EmbedBuilder()
      .setTitle(`📊 Rank ${action}`)
      .addFields(
        { name: 'Ranked By', value: rankerUsername, inline: true },
        { name: 'Target User', value: targetUsername, inline: true },
        { name: 'Action', value: action, inline: true },
        { name: 'Old Rank', value: oldRank, inline: true },
        { name: 'New Rank', value: newRank, inline: true }
      )
      .setColor(action === 'Promotion' ? 0x00ff00 : action === 'Demotion' ? 0xff9900 : 0x0099ff)
      .setTimestamp();
    
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error logging ranking action:', error.message);
  }
}

// Check if user has permission to use ranking commands
async function canUseRankingCommands(discordUserId) {
  const robloxUsername = verifiedUsers.get(discordUserId);
  if (!robloxUsername) return false;
  
  const userId = await getRobloxUserId(robloxUsername);
  if (!userId) return false;
  
  const rank = await getUserRankInGroup(userId);
  if (!rank) return false;
  
  return rank.rank >= config.MIN_RANK_TO_USE_COMMANDS;
}

// Discord Commands
const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Start verification process to link your Roblox account')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Your Roblox username')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('confirmverify')
    .setDescription('Complete verification after adding code to your Roblox bio'),
  
  new SlashCommandBuilder()
    .setName('getrank')
    .setDescription('Get a user\'s current rank')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Roblox username')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Promote a user in the Roblox group (Verified users only)')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Roblox username')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('demote')
    .setDescription('Demote a user in the Roblox group (Verified users only)')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Roblox username')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('setrank')
    .setDescription('Set a user to a specific rank (Verified users only)')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Roblox username')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('rank')
        .setDescription('Rank number (0-255)')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('update')
    .setDescription('Update Discord roles for a verified user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Discord user to update')
        .setRequired(true))
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
client.once('ready', async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  client.user.setActivity('Roblox Groups', { type: 'WATCHING' });
  
  // Load verified users on startup
  await loadVerifiedUsers();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  await interaction.deferReply({ ephemeral: commandName === 'verify' || commandName === 'confirmverify' });

  try {
    if (commandName === 'verify') {
      const username = interaction.options.getString('username');
      const userId = await getRobloxUserId(username);
      
      if (!userId) {
        return interaction.editReply('❌ Roblox user not found!');
      }
      
      const currentRank = await getUserRankInGroup(userId);
      if (!currentRank) {
        return interaction.editReply('❌ User is not in the group! Please join the group first.');
      }
      
      const code = generateVerificationCode();
      pendingVerifications.set(interaction.user.id, { username, code, userId });
      
      const embed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle('🔐 Verification Step 1/2')
        .setDescription('To verify you own this Roblox account, please follow these steps:')
        .addFields(
          { name: '1️⃣ Copy this code', value: `\`${code}\``, inline: false },
          { name: '2️⃣ Go to Roblox', value: 'Visit roblox.com and log in', inline: false },
          { name: '3️⃣ Edit your profile', value: 'Go to Profile → About → Edit', inline: false },
          { name: '4️⃣ Add the code to your bio', value: `Paste \`${code}\` anywhere in your "About" section`, inline: false },
          { name: '5️⃣ Come back here', value: 'Run `/confirmverify` to complete verification', inline: false }
        )
        .setFooter({ text: 'This code expires in 10 minutes' })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      
      setTimeout(() => {
        pendingVerifications.delete(interaction.user.id);
      }, 10 * 60 * 1000);
    }
    
    else if (commandName === 'confirmverify') {
      const pending = pendingVerifications.get(interaction.user.id);
      
      if (!pending) {
        return interaction.editReply('❌ No pending verification found! Please run `/verify` first.');
      }
      
      const { username, code, userId } = pending;
      
      const codeFound = await checkVerificationCode(userId, code);
      
      if (!codeFound) {
        return interaction.editReply(`❌ Verification code not found in your Roblox bio! Make sure you added \`${code}\` to your "About" section and try again.`);
      }
      
      verifiedUsers.set(interaction.user.id, username);
      pendingVerifications.delete(interaction.user.id);
      
      // Save to file
      await saveVerifiedUsers();
      
      const currentRank = await getUserRankInGroup(userId);
      const member = interaction.member;
      const roleUpdate = await updateDiscordRoles(member, currentRank.rank);
      
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Verification Complete!')
        .setDescription('You can now remove the code from your Roblox bio.')
        .addFields(
          { name: 'Roblox Username', value: username, inline: true },
          { name: 'Group Rank', value: `${currentRank.name} (${currentRank.rank})`, inline: true }
        )
        .setTimestamp();
      
      if (roleUpdate && roleUpdate.added.length > 0) {
        embed.addFields({ name: 'Roles Added', value: roleUpdate.added.join(', '), inline: false });
      }
      
      await interaction.editReply({ embeds: [embed] });
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
    
    else if (commandName === 'promote') {
      const canRank = await canUseRankingCommands(interaction.user.id);
      if (!canRank) {
        return interaction.editReply('❌ You must be verified and have rank ' + config.MIN_RANK_TO_USE_COMMANDS + ' or higher to use this command!');
      }
      
      const username = interaction.options.getString('username');
      
      // Prevent self-promotion
      const rankerUsername = verifiedUsers.get(interaction.user.id);
      if (username.toLowerCase() === rankerUsername.toLowerCase()) {
        return interaction.editReply('❌ You cannot promote yourself!');
      }
      
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
        await logRankingAction(interaction.guild, rankerUsername, username, currentRank.name, nextRole.name, 'Promotion');
        
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
      const canRank = await canUseRankingCommands(interaction.user.id);
      if (!canRank) {
        return interaction.editReply('❌ You must be verified and have rank ' + config.MIN_RANK_TO_USE_COMMANDS + ' or higher to use this command!');
      }
      
      const username = interaction.options.getString('username');
      
      // Prevent self-demotion
      const rankerUsername = verifiedUsers.get(interaction.user.id);
      if (username.toLowerCase() === rankerUsername.toLowerCase()) {
        return interaction.editReply('❌ You cannot demote yourself!');
      }
      
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
        await logRankingAction(interaction.guild, rankerUsername, username, currentRank.name, previousRole.name, 'Demotion');
        
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
      const canRank = await canUseRankingCommands(interaction.user.id);
      if (!canRank) {
        return interaction.editReply('❌ You must be verified and have rank ' + config.MIN_RANK_TO_USE_COMMANDS + ' or higher to use this command!');
      }
      
      const username = interaction.options.getString('username');
      const targetRank = interaction.options.getInteger('rank');
      
      // Prevent self-ranking
      const rankerUsername = verifiedUsers.get(interaction.user.id);
      if (username.toLowerCase() === rankerUsername.toLowerCase()) {
        return interaction.editReply('❌ You cannot change your own rank!');
      }
      
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
        await logRankingAction(interaction.guild, rankerUsername, username, currentRank.name, targetRole.name, 'Set Rank');
        
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
    
    else if (commandName === 'update') {
      const targetUser = interaction.options.getUser('user');
      const robloxUsername = verifiedUsers.get(targetUser.id);
      
      if (!robloxUsername) {
        return interaction.editReply('❌ This user has not verified their Roblox account!');
      }
      
      const userId = await getRobloxUserId(robloxUsername);
      if (!userId) {
        return interaction.editReply('❌ Could not find Roblox user!');
      }
      
      const currentRank = await getUserRankInGroup(userId);
      if (!currentRank) {
        return interaction.editReply('❌ User is not in the group!');
      }
      
      const member = await interaction.guild.members.fetch(targetUser.id);
      const roleUpdate = await updateDiscordRoles(member, currentRank.rank);
      
      if (!roleUpdate) {
        return interaction.editReply('❌ Failed to update roles!');
      }
      
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Roles Updated')
        .addFields(
          { name: 'User', value: `<@${targetUser.id}>`, inline: true },
          { name: 'Roblox Username', value: robloxUsername, inline: true },
          { name: 'Current Rank', value: `${currentRank.name} (${currentRank.rank})`, inline: true }
        );
      
      if (roleUpdate.added.length > 0) {
        embed.addFields({ name: 'Roles Added', value: roleUpdate.added.join(', ') });
      }
      
      if (roleUpdate.removed.length > 0) {
        embed.addFields({ name: 'Roles Removed', value: roleUpdate.removed.join(', ') });
      }
      
      return interaction.editReply({ embeds: [embed] });
    }
    
  } catch (error) {
    console.error('Command error:', error);
    await interaction.editReply('❌ An error occurred while processing the command.');
  }
});

// Login to Discord
client.login(config.DISCORD_TOKEN);
