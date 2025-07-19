const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

// Configuration
const config = {
    discordToken: process.env.DISCORD_BOT_TOKEN,
    riotApiKey: process.env.RIOT_API_KEY,
    clientId: process.env.DISCORD_CLIENT_ID,
    checkInterval: 45000 // 45 seconds to respect rate limits
};

// Database setup
const db = new sqlite3.Database('valorant_users.db');

// Initialize database
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_user_id TEXT UNIQUE,
        discord_channel_id TEXT,
        valorant_username TEXT,
        valorant_tag TEXT,
        region TEXT,
        puuid TEXT,
        current_match_id TEXT,
        active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Slash Commands
const commands = [
    new SlashCommandBuilder()
        .setName('register')
        .setDescription('Register your Valorant account for match tracking')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Your Valorant username (without #tag)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('Your Valorant tag (the numbers after #)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('region')
                .setDescription('Your region')
                .setRequired(true)
                .addChoices(
                    { name: 'North America', value: 'na1' },
                    { name: 'Europe', value: 'eu' },
                    { name: 'Asia Pacific', value: 'ap' },
                    { name: 'Korea', value: 'kr' },
                    { name: 'Latin America', value: 'latam' },
                    { name: 'Brazil', value: 'br' }
                )),
    
    new SlashCommandBuilder()
        .setName('unregister')
        .setDescription('Stop tracking your Valorant matches'),
    
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check your registration status'),
    
    new SlashCommandBuilder()
        .setName('test')
        .setDescription('Test the bot with your last match (for debugging)')
];

class ValorantBot {
    constructor() {
        this.client = new Client({
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
        });
        
        this.activeUsers = new Map();
        this.setupBot();
        this.registerCommands();
    }

    async registerCommands() {
        const rest = new REST({ version: '10' }).setToken(config.discordToken);
        
        try {
            console.log('Started refreshing application (/) commands.');
            
            await rest.put(
                Routes.applicationCommands(config.clientId),
                { body: commands.map(command => command.toJSON()) }
            );
            
            console.log('Successfully reloaded application (/) commands.');
        } catch (error) {
            console.error('Error registering commands:', error);
        }
    }

    async setupBot() {
        this.client.once('ready', () => {
            console.log(`Bot logged in as ${this.client.user.tag}`);
            this.loadActiveUsers();
            this.startMatchMonitoring();
        });

        this.client.on('interactionCreate', async interaction => {
            if (!interaction.isChatInputCommand()) return;

            const { commandName } = interaction;

            try {
                switch (commandName) {
                    case 'register':
                        await this.handleRegister(interaction);
                        break;
                    case 'unregister':
                        await this.handleUnregister(interaction);
                        break;
                    case 'status':
                        await this.handleStatus(interaction);
                        break;
                    case 'test':
                        await this.handleTest(interaction);
                        break;
                }
            } catch (error) {
                console.error('Error handling command:', error);
                await interaction.reply({ 
                    content: 'An error occurred while processing your command.', 
                    ephemeral: true 
                });
            }
        });

        this.client.login(config.discordToken);
    }

    async handleRegister(interaction) {
        const username = interaction.options.getString('username');
        const tag = interaction.options.getString('tag');
        const region = interaction.options.getString('region');
        const userId = interaction.user.id;
        const channelId = interaction.channel.id;

        await interaction.deferReply({ ephemeral: true });

        try {
            // Get PUUID from Riot API
            const puuid = await this.getUserPuuid(username, tag);
            if (!puuid) {
                await interaction.editReply('❌ Could not find your Valorant account. Please check your username and tag.');
                return;
            }

            // Save to database
            await this.addUser(userId, channelId, username, tag, region, puuid);

            const embed = new EmbedBuilder()
                .setTitle('✅ Registration Successful!')
                .setDescription(`Your Valorant account **${username}#${tag}** has been registered for match tracking.`)
                .addFields(
                    { name: 'Region', value: region.toUpperCase(), inline: true },
                    { name: 'Channel', value: `<#${channelId}>`, inline: true }
                )
                .setColor(0x00ff00)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Registration error:', error);
            await interaction.editReply('❌ An error occurred during registration. Please try again.');
        }
    }

    async handleUnregister(interaction) {
        const userId = interaction.user.id;

        await interaction.deferReply({ ephemeral: true });

        try {
            // Remove from database
            await new Promise((resolve, reject) => {
                db.run("UPDATE users SET active = 0 WHERE discord_user_id = ?", [userId], function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                });
            });

            // Remove from active users
            this.activeUsers.delete(userId);

            const embed = new EmbedBuilder()
                .setTitle('✅ Unregistered Successfully')
                .setDescription('Your Valorant account has been unregistered. You will no longer receive match notifications.')
                .setColor(0xff9900)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Unregistration error:', error);
            await interaction.editReply('❌ An error occurred during unregistration.');
        }
    }

    async handleStatus(interaction) {
        const userId = interaction.user.id;

        await interaction.deferReply({ ephemeral: true });

        try {
            const userData = this.activeUsers.get(userId);
            
            if (!userData) {
                await interaction.editReply('❌ You are not registered. Use `/register` to set up match tracking.');
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('📊 Registration Status')
                .addFields(
                    { name: 'Valorant Account', value: `${userData.username}#${userData.tag}`, inline: true },
                    { name: 'Region', value: userData.region.toUpperCase(), inline: true },
                    { name: 'Channel', value: `<#${userData.channelId}>`, inline: true },
                    { name: 'Status', value: '🟢 Active', inline: true }
                )
                .setColor(0x0099ff)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Status error:', error);
            await interaction.editReply('❌ An error occurred while checking your status.');
        }
    }

    async handleTest(interaction) {
        const userId = interaction.user.id;

        await interaction.deferReply({ ephemeral: true });

        try {
            const userData = this.activeUsers.get(userId);
            
            if (!userData) {
                await interaction.editReply('❌ You are not registered. Use `/register` first.');
                return;
            }

            await interaction.editReply('🔍 Testing with your last match...');

            // Get last match
            const matchResponse = await axios.get(
                `https://${userData.region}.api.riotgames.com/val/match/v1/matchlists/by-puuid/${userData.puuid}?size=1`,
                {
                    headers: {
                        'X-Riot-Token': config.riotApiKey
                    }
                }
            );

            const latestMatch = matchResponse.data.history[0];
            if (latestMatch) {
                await this.sendMatchStats(userId, userData, latestMatch.matchId);
                await interaction.editReply('✅ Test completed! Check the channel for the match stats.');
            } else {
                await interaction.editReply('❌ No recent matches found.');
            }

        } catch (error) {
            console.error('Test error:', error);
            await interaction.editReply('❌ An error occurred during testing.');
        }
    }

    loadActiveUsers() {
        db.all("SELECT * FROM users WHERE active = 1", (err, rows) => {
            if (err) {
                console.error('Error loading users:', err);
                return;
            }
            
            rows.forEach(user => {
                this.activeUsers.set(user.discord_user_id, {
                    channelId: user.discord_channel_id,
                    username: user.valorant_username,
                    tag: user.valorant_tag,
                    region: user.region,
                    puuid: user.puuid,
                    currentMatchId: user.current_match_id
                });
            });
            
            console.log(`Loaded ${this.activeUsers.size} active users`);
        });
    }

    async addUser(discordUserId, channelId, valUsername, valTag, region, puuid) {
        return new Promise((resolve, reject) => {
            db.run(`INSERT OR REPLACE INTO users 
                   (discord_user_id, discord_channel_id, valorant_username, valorant_tag, region, puuid, active)
                   VALUES (?, ?, ?, ?, ?, ?, 1)`,
                [discordUserId, channelId, valUsername, valTag, region, puuid],
                function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    // Add to active users
                    bot.activeUsers.set(discordUserId, {
                        channelId,
                        username: valUsername,
                        tag: valTag,
                        region,
                        puuid,
                        currentMatchId: null
                    });
                    
                    resolve(true);
                }
            );
        });
    }

    async getUserPuuid(username, tag) {
        try {
            const response = await axios.get(
                `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${username}/${tag}`,
                {
                    headers: {
                        'X-Riot-Token': config.riotApiKey
                    }
                }
            );
            return response.data.puuid;
        } catch (error) {
            console.error('Error getting PUUID:', error.response?.data || error.message);
            return null;
        }
    }

    startMatchMonitoring() {
        setInterval(async () => {
            for (const [userId, userData] of this.activeUsers) {
                await this.checkUserMatch(userId, userData);
                // Small delay between users to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }, config.checkInterval);
    }

    async checkUserMatch(userId, userData) {
        if (!userData.puuid) return;

        try {
            const matchResponse = await axios.get(
                `https://${userData.region}.api.riotgames.com/val/match/v1/matchlists/by-puuid/${userData.puuid}?size=1`,
                {
                    headers: {
                        'X-Riot-Token': config.riotApiKey
                    }
                }
            );

            const latestMatch = matchResponse.data.history[0];
            
            if (latestMatch && latestMatch.matchId !== userData.currentMatchId) {
                userData.currentMatchId = latestMatch.matchId;
                
                // Update database
                db.run("UPDATE users SET current_match_id = ? WHERE discord_user_id = ?", 
                      [latestMatch.matchId, userId]);

                // Check if match just started
                const matchStartTime = new Date(latestMatch.gameStartTimeMillis);
                const now = new Date();
                const timeDiff = now - matchStartTime;
                
                if (timeDiff < 10 * 60 * 1000) { // 10 minutes
                    await this.sendMatchStats(userId, userData, latestMatch.matchId);
                }
            }
        } catch (error) {
            console.error(`Error checking match for user ${userId}:`, error.response?.data || error.message);
        }
    }

    async sendMatchStats(userId, userData, matchId) {
        try {
            const matchDetails = await axios.get(
                `https://${userData.region}.api.riotgames.com/val/match/v1/matches/${matchId}`,
                {
                    headers: {
                        'X-Riot-Token': config.riotApiKey
                    }
                }
            );

            const match = matchDetails.data;
            const players = match.players;
            
            // Find user's player data
            const userPlayer = players.find(p => p.puuid === userData.puuid);
            if (!userPlayer) return;

            const userTeam = userPlayer.teamId;
            const teammates = players.filter(p => p.teamId === userTeam && p.puuid !== userData.puuid);
            const enemies = players.filter(p => p.teamId !== userTeam);

            // Get detailed stats for all players
            const teamStats = await this.getPlayersStats(teammates, userData.region);
            const enemyStats = await this.getPlayersStats(enemies, userData.region);

            // Create Discord embed
            const embed = new EmbedBuilder()
                .setTitle('🎯 Valorant Match Started!')
                .setDescription(`**${userData.username}#${userData.tag}** - Match detected!\n\nMap: **${match.matchInfo.mapId}**\nMode: **${match.matchInfo.queueId}**`)
                .setColor(0x00ff00)
                .setTimestamp();

            // Add teammates field
            if (teamStats.length > 0) {
                const teammateText = teamStats.map(player => 
                    `**${player.name}#${player.tag}**\n` +
                    `Rank: ${player.rank} | K/D: ${player.avgKD} | WR: ${player.winRate}%`
                ).join('\n\n');
                
                embed.addFields({
                    name: '👥 Your Teammates',
                    value: teammateText || 'No data available',
                    inline: false
                });
            }

            // Add enemies field
            if (enemyStats.length > 0) {
                const enemyText = enemyStats.map(player => 
                    `**${player.name}#${player.tag}**\n` +
                    `Rank: ${player.rank} | K/D: ${player.avgKD} | WR: ${player.winRate}%`
                ).join('\n\n');
                
                embed.addFields({
                    name: '⚔️ Enemy Team',
                    value: enemyText || 'No data available',
                    inline: false
                });
            }

            const channel = this.client.channels.cache.get(userData.channelId);
            if (channel) {
                await channel.send({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Error sending match stats:', error.response?.data || error.message);
        }
    }

    async getPlayersStats(players, region) {
        const playerStats = [];

        for (const player of players.slice(0, 5)) { // Limit to 5 players to avoid rate limits
            try {
                // Get player's recent matches for stats calculation
                const matchHistory = await axios.get(
                    `https://${region}.api.riotgames.com/val/match/v1/matchlists/by-puuid/${player.puuid}?size=5`,
                    {
                        headers: {
                            'X-Riot-Token': config.riotApiKey
                        }
                    }
                );

                let totalKills = 0;
                let totalDeaths = 0;
                let totalWins = 0;
                let totalMatches = 0;
                let rank = 'Unranked';

                // Calculate stats from recent matches
                for (const match of matchHistory.data.history.slice(0, 3)) { // Only check last 3 matches
                    try {
                        const matchDetail = await axios.get(
                            `https://${region}.api.riotgames.com/val/match/v1/matches/${match.matchId}`,
                            {
                                headers: {
                                    'X-Riot-Token': config.riotApiKey
                                }
                            }
                        );

                        const playerData = matchDetail.data.players.find(p => p.puuid === player.puuid);
                        if (playerData) {
                            totalKills += playerData.stats.kills;
                            totalDeaths += playerData.stats.deaths;
                            totalMatches++;
                            
                            // Check if won (simplified)
                            if (playerData.stats.roundsWon > playerData.stats.roundsLost) {
                                totalWins++;
                            }

                            // Get rank from most recent competitive match
                            if (playerData.competitiveTier && playerData.competitiveTier > 0) {
                                rank = this.getRankName(playerData.competitiveTier);
                            }
                        }
                    } catch (matchError) {
                        continue;
                    }
                }

                const avgKD = totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : totalKills.toFixed(2);
                const winRate = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0;

                playerStats.push({
                    name: player.gameName || 'Unknown',
                    tag: player.tagLine || '0000',
                    rank: rank,
                    avgKD: avgKD,
                    winRate: winRate
                });

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                playerStats.push({
                    name: player.gameName || 'Unknown',
                    tag: player.tagLine || '0000',
                    rank: 'Unknown',
                    avgKD: 'N/A',
                    winRate: 'N/A'
                });
            }
        }

        return playerStats;
    }

    getRankName(tier) {
        const ranks = {
            3: 'Iron 1', 4: 'Iron 2', 5: 'Iron 3',
            6: 'Bronze 1', 7: 'Bronze 2', 8: 'Bronze 3',
            9: 'Silver 1', 10: 'Silver 2', 11: 'Silver 3',
            12: 'Gold 1', 13: 'Gold 2', 14: 'Gold 3',
            15: 'Platinum 1', 16: 'Platinum 2', 17: 'Platinum 3',
            18: 'Diamond 1', 19: 'Diamond 2', 20: 'Diamond 3',
            21: 'Ascendant 1', 22: 'Ascendant 2', 23: 'Ascendant 3',
            24: 'Immortal 1', 25: 'Immortal 2', 26: 'Immortal 3',
            27: 'Radiant'
        };
        return ranks[tier] || 'Unranked';
    }
}

// Create and start the bot
const bot = new ValorantBot();

// Handle process termination
process.on('SIGINT', () => {
    console.log('Bot shutting down...');
    bot.client.destroy();
    db.close();
    process.exit(0);
});

module.exports = bot;