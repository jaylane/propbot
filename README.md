# PropBot 🎯

A Discord bot for tracking sports betting props with **live ESPN updates**. Add your bets, get real-time stat tracking as games progress, and see P&L summaries when games finish.

## Features

- 📸 **AI Bet Slip Parsing** — Upload a bet slip image and PropBot auto-extracts all your bets
- 📊 **Live Stat Tracking** — Real-time player stats from ESPN (free, no API key required)
- 🔔 **Auto Monitoring** — Posts live updates to a channel as games progress
- 📈 **Odds Comparison** — Compare lines across sportsbooks (BYOK: bring your own Odds API key)
- 🎰 **Parlay Support** — Track multi-leg parlays, auto-settle when all games finish
- 🗄️ **Zero-Config DB** — SQLite, no external database needed

## Supported Sports

| Sport | Coverage |
|-------|----------|
| NBA | Full box score, all stats |
| NCAAB | Full box score, all stats |
| NFL | Passing/rushing/receiving yards, TDs |
| MLB | Hits, strikeouts (partial) |
| NHL | Goals, assists, saves (partial) |

## Supported Prop Types

| Stat | Command Key | Description |
|------|-------------|-------------|
| Points | `points` or `pts` | Player points |
| Rebounds | `rebounds` or `reb` | Total rebounds |
| Assists | `assists` or `ast` | Assists |
| 3-Pointers | `threePointers` or `3pm` | 3PT made |
| Steals | `steals` or `stl` | Steals |
| Blocks | `blocks` or `blk` | Blocks |
| Turnovers | `turnovers` or `to` | Turnovers |
| PRA | `pra` | Points + Rebounds + Assists |
| RA | `ra` | Rebounds + Assists |
| PA | `pa` | Points + Assists |
| PR | `pr` | Points + Rebounds |

## Slash Commands

### `/prop add` — Track a single prop
```
/prop add player:Anthony Edwards stat:threePointers line:3.5 direction:over game:TOR@MIN wager:20
/prop add player:Nikola Jokic stat:pra line:52.5 direction:over game:LAL@DEN wager:50 odds:-110
```

### `/prop list` — View your active props
### `/prop remove slip:1` — Void a slip

### `/parlay` — Track a multi-leg parlay
```
/parlay wager:25 legs:Edwards O3.5 3PM, Randle O6.5 REB, Murray O25.5 PTS
/parlay wager:50 legs:Jokic O52.5 PRA, LeBron O25.5 PTS odds:+450
```

### `/track` — Parse a bet slip image
```
/track slip:[attach image]
/track text:"Edwards 3PM over 3.5 -115, Jokic PRA over 52.5 -110, wager $25"
```

### `/monitor start` — Enable live updates
```
/monitor start channel:#prop-tracker interval:5
/monitor stop
/monitor status
```
*(Requires Manage Channels permission)*

### `/status` — Check current stats
```
/status           — All active bets in server
/status slip:3    — Specific slip
```

### `/odds` — Compare lines (BYOK)
```
/odds game:"Lakers vs Nuggets" market:spreads
/odds game:MIN sport:nba market:h2h
```

### `/settings` — Configure preferences
```
/settings oddskey:YOUR_ODDS_API_KEY
/settings timezone:America/Los_Angeles
/settings    — View current settings
```

---

## Setup

### Prerequisites
- Node.js 20+
- A Discord bot token ([guide](https://discord.com/developers/docs/getting-started))
- OpenAI API key (optional, for `/track` slip parsing)
- The Odds API key (optional, per-user BYOK for `/odds`)

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/propbot
cd propbot
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```env
DISCORD_TOKEN=your-discord-bot-token
DISCORD_CLIENT_ID=your-discord-client-id
OPENAI_API_KEY=your-openai-key          # Optional: for /track
ENCRYPTION_KEY=$(openssl rand -hex 32)  # Required: for encrypting user keys
DATABASE_PATH=./data/propbot.db
```

### 3. Register Commands

For a specific guild (instant, good for testing):
```bash
GUILD_ID=your-guild-id npm run register
```

For all guilds (takes ~1 hour to propagate):
```bash
npm run register
```

### 4. Start the Bot

```bash
npm run build && npm start
# or for development:
npm run dev
```

---

## Docker Deployment

```bash
# Build
docker build -t propbot .

# Run
docker run -d \
  --name propbot \
  --restart unless-stopped \
  -e DISCORD_TOKEN=your-token \
  -e DISCORD_CLIENT_ID=your-client-id \
  -e OPENAI_API_KEY=your-openai-key \
  -e ENCRYPTION_KEY=your-32-byte-hex \
  -v propbot_data:/app/data \
  propbot
```

## Railway / Fly.io

Both platforms support Docker-based deployment. Set the environment variables in their dashboard and point to this repo. The SQLite database persists on a mounted volume.

---

## How Live Tracking Works

1. You add a prop with `/prop add` and specify the `game:` argument (e.g. `TOR@MIN`)
2. PropBot looks up the ESPN game ID for that matchup today
3. The monitor loop (if started) fetches the box score every N minutes
4. When the game is `final`, PropBot evaluates all legs and settles the slip
5. Results are posted to the configured monitor channel

### Linking Parlays to Games

The `/parlay` command parses free-text legs but can't always auto-link each player to a game. For reliable tracking:
1. Use `/parlay` to create the slip (it stores the legs)
2. The monitor will attempt matching — or use `/prop add` per leg for explicit game linking

---

## Architecture

```
src/
├── index.ts              — Bot entrypoint, command dispatch
├── register-commands.ts  — One-time Discord command registration
├── commands/             — Slash command handlers
│   ├── prop.ts           — /prop (add/list/remove)
│   ├── parlay.ts         — /parlay
│   ├── track.ts          — /track (AI vision parsing)
│   ├── monitor.ts        — /monitor (start/stop/status)
│   ├── status.ts         — /status
│   ├── odds.ts           — /odds (BYOK)
│   └── settings.ts       — /settings
├── services/
│   ├── espn.ts           — ESPN API (free, no key)
│   ├── odds-api.ts       — The Odds API (BYOK)
│   ├── slip-parser.ts    — AI vision parsing (OpenAI GPT-4o)
│   ├── prop-tracker.ts   — Leg evaluation engine
│   └── monitor.ts        — Game monitoring loop
├── models/               — TypeScript types
├── db/                   — SQLite (better-sqlite3)
└── utils/                — Embeds, constants, crypto
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | ✅ | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | ✅ | Application ID from Discord Developer Portal |
| `ENCRYPTION_KEY` | ✅ | 64-char hex string for AES-256 encryption of user keys |
| `OPENAI_API_KEY` | Optional | Required for `/track` slip image parsing |
| `DATABASE_PATH` | Optional | Path to SQLite file (default: `./data/propbot.db`) |
| `MONITOR_INTERVAL_MINUTES` | Optional | Default monitor interval in minutes (default: 5) |

---

## Discord Bot Permissions

When adding the bot to a server, it needs:
- `Send Messages`
- `Embed Links`
- `Read Message History`
- `Use Slash Commands`

The `/monitor` command requires the user to have **Manage Channels** permission.

OAuth2 scopes: `bot`, `applications.commands`

---

## License

MIT — go build something cool.
