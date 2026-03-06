PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  odds_api_key_enc TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS slips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('single', 'parlay')),
  wager REAL NOT NULL,
  to_win REAL,
  odds INTEGER,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'won', 'lost', 'push', 'void')),
  source TEXT DEFAULT 'manual' CHECK(source IN ('manual', 'image', 'text')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  settled_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS legs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slip_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('prop', 'moneyline', 'spread', 'total')),
  player TEXT,
  team TEXT,
  stat TEXT,
  line REAL,
  direction TEXT CHECK(direction IN ('over', 'under', NULL)),
  game_id TEXT,
  sport TEXT DEFAULT 'nba',
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'hit', 'miss', 'push', 'void')),
  current_value REAL,
  odds INTEGER,
  settled_at DATETIME,
  FOREIGN KEY (slip_id) REFERENCES slips(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS monitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL UNIQUE,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  interval_ms INTEGER DEFAULT 300000,
  active INTEGER DEFAULT 1,
  last_check DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_cache (
  game_id TEXT NOT NULL,
  sport TEXT NOT NULL,
  data TEXT NOT NULL,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (game_id, sport)
);

CREATE INDEX IF NOT EXISTS idx_slips_user ON slips(user_id);
CREATE INDEX IF NOT EXISTS idx_slips_guild ON slips(guild_id);
CREATE INDEX IF NOT EXISTS idx_slips_status ON slips(status);
CREATE INDEX IF NOT EXISTS idx_legs_slip ON legs(slip_id);
CREATE INDEX IF NOT EXISTS idx_legs_game ON legs(game_id);
