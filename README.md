# ValorantTracker Discord Bot

A sophisticated Discord bot that automatically detects Valorant matches and provides detailed statistics about teammates and enemies.

## Features

- 🔍 **Automatic Match Detection** - Detects when you start a Valorant match
- 📊 **Player Statistics** - K/D ratios, win rates, and performance metrics
- 🏆 **Rank Information** - Current competitive ranks for all players
- 👥 **Team Analysis** - Separate breakdowns for teammates and enemies
- 🌍 **Multi-Region Support** - Works across all Valorant regions
- ⚡ **Real-time Updates** - Get match info within seconds

## Commands

- `/register` - Register your Valorant account for tracking
- `/status` - Check your registration status
- `/unregister` - Stop tracking your matches
- `/test` - Test the bot with your last match

## Setup

### Prerequisites

- Node.js 16 or higher
- Discord application with bot token
- Riot Games API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd valorant-discord-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your tokens:
   ```
   DISCORD_BOT_TOKEN=your_discord_bot_token
   DISCORD_CLIENT_ID=your_discord_client_id
   RIOT_API_KEY=your_riot_api_key
   ```

4. **Run the bot**
   ```bash
   npm start
   ```

   For development with auto-restart:
   ```bash
   npm run dev
   ```

## Getting API Keys

### Discord Bot Token
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section
4. Copy the bot token
5. Copy the application ID (Client ID)

### Riot API Key
1. Visit [Riot Developer Portal](https://developer.riotgames.com/)
2. Sign in with your Riot account
3. Generate a development API key
4. For production, apply for a production key

## Bot Permissions

Your Discord bot needs these permissions:
- Send Messages
- Use Slash Commands
- Embed Links
- Read Message History

## File Structure

```
valorant-discord-bot/
├── bot.js              # Main bot file
├── package.json        # Dependencies and scripts
├── .env               # Environment variables (not in git)
├── .env.example       # Environment template
├── .gitignore         # Git ignore rules
├── README.md          # This file
└── valorant_users.db  # SQLite database (auto-created)
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DISCORD_BOT_TOKEN` | Your Discord bot token |
| `DISCORD_CLIENT_ID` | Your Discord application client ID |
| `RIOT_API_KEY` | Your Riot Games API key |

## Rate Limits

- **Development API**: 100 requests per 2 minutes
- **Production API**: Higher limits (varies by approval)

The bot automatically handles rate limiting with delays between API calls.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Disclaimer

This project is not affiliated with Riot Games. Valorant is a trademark of Riot Games, Inc.

## License

MIT License - see LICENSE file for details.#   v a l o r a n t - d i s c o r d - b o t  
 