import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH ?? './data/propbot.db';
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
}

// ── Users ─────────────────────────────────────────────────────────────────────

export function upsertUser(userId: string): void {
  getDb().prepare(`
    INSERT INTO users (id) VALUES (?)
    ON CONFLICT(id) DO NOTHING
  `).run(userId);
}

export function getUser(userId: string) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(userId) as {
    id: string;
    odds_api_key_enc: string | null;
    timezone: string;
    created_at: string;
  } | undefined;
}

export function updateUserOddsKey(userId: string, encryptedKey: string): void {
  upsertUser(userId);
  getDb().prepare('UPDATE users SET odds_api_key_enc = ? WHERE id = ?').run(encryptedKey, userId);
}

export function updateUserTimezone(userId: string, timezone: string): void {
  upsertUser(userId);
  getDb().prepare('UPDATE users SET timezone = ? WHERE id = ?').run(timezone, userId);
}

// ── Slips ─────────────────────────────────────────────────────────────────────

export interface SlipInsert {
  userId: string;
  guildId: string;
  channelId: string;
  type: 'single' | 'parlay';
  wager: number;
  toWin?: number;
  odds?: number;
  source?: 'manual' | 'image' | 'text';
}

export function insertSlip(slip: SlipInsert): number {
  upsertUser(slip.userId);
  const result = getDb().prepare(`
    INSERT INTO slips (user_id, guild_id, channel_id, type, wager, to_win, odds, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(slip.userId, slip.guildId, slip.channelId, slip.type, slip.wager,
         slip.toWin ?? null, slip.odds ?? null, slip.source ?? 'manual');
  return result.lastInsertRowid as number;
}

export function getSlip(slipId: number) {
  return getDb().prepare('SELECT * FROM slips WHERE id = ?').get(slipId) as SlipRow | undefined;
}

export function getActiveSlips(guildId: string) {
  return getDb().prepare(`
    SELECT * FROM slips WHERE guild_id = ? AND status = 'active' ORDER BY created_at DESC
  `).all(guildId) as SlipRow[];
}

export function getUserActiveSlips(userId: string, guildId: string) {
  return getDb().prepare(`
    SELECT * FROM slips WHERE user_id = ? AND guild_id = ? AND status = 'active' ORDER BY created_at DESC
  `).all(userId, guildId) as SlipRow[];
}

export function updateSlipStatus(slipId: number, status: 'active' | 'won' | 'lost' | 'push' | 'void'): void {
  const settledAt = status !== 'active' ? new Date().toISOString() : null;
  getDb().prepare('UPDATE slips SET status = ?, settled_at = ? WHERE id = ?').run(status, settledAt, slipId);
}

// ── Legs ──────────────────────────────────────────────────────────────────────

export interface LegInsert {
  slipId: number;
  type: 'prop' | 'moneyline' | 'spread' | 'total';
  player?: string;
  team?: string;
  stat?: string;
  line?: number;
  direction?: 'over' | 'under';
  gameId?: string;
  sport?: string;
  odds?: number;
}

export function insertLeg(leg: LegInsert): number {
  const result = getDb().prepare(`
    INSERT INTO legs (slip_id, type, player, team, stat, line, direction, game_id, sport, odds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    leg.slipId, leg.type, leg.player ?? null, leg.team ?? null,
    leg.stat ?? null, leg.line ?? null, leg.direction ?? null,
    leg.gameId ?? null, leg.sport ?? 'nba', leg.odds ?? null
  );
  return result.lastInsertRowid as number;
}

export function getLegs(slipId: number) {
  return getDb().prepare('SELECT * FROM legs WHERE slip_id = ? ORDER BY id').all(slipId) as LegRow[];
}

export function getActiveLegs() {
  return getDb().prepare(`
    SELECT l.*, s.guild_id, s.user_id, s.channel_id, s.wager, s.type as slip_type
    FROM legs l
    JOIN slips s ON l.slip_id = s.id
    WHERE s.status = 'active' AND l.status = 'pending'
    AND l.game_id IS NOT NULL
  `).all() as (LegRow & { guild_id: string; user_id: string; channel_id: string; wager: number; slip_type: string })[];
}

export function updateLeg(legId: number, fields: { status?: string; currentValue?: number }): void {
  if (fields.status !== undefined && fields.currentValue !== undefined) {
    const settledAt = fields.status !== 'pending' ? new Date().toISOString() : null;
    getDb().prepare(
      'UPDATE legs SET status = ?, current_value = ?, settled_at = ? WHERE id = ?'
    ).run(fields.status, fields.currentValue, settledAt, legId);
  } else if (fields.currentValue !== undefined) {
    getDb().prepare('UPDATE legs SET current_value = ? WHERE id = ?').run(fields.currentValue, legId);
  }
}

// ── Monitors ──────────────────────────────────────────────────────────────────

export function upsertMonitor(guildId: string, channelId: string, userId: string, intervalMs: number): void {
  getDb().prepare(`
    INSERT INTO monitors (guild_id, channel_id, user_id, interval_ms, active)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(guild_id) DO UPDATE SET
      channel_id = excluded.channel_id,
      user_id = excluded.user_id,
      interval_ms = excluded.interval_ms,
      active = 1
  `).run(guildId, channelId, userId, intervalMs);
}

export function getMonitor(guildId: string) {
  return getDb().prepare('SELECT * FROM monitors WHERE guild_id = ?').get(guildId) as MonitorRow | undefined;
}

export function getAllActiveMonitors() {
  return getDb().prepare('SELECT * FROM monitors WHERE active = 1').all() as MonitorRow[];
}

export function setMonitorActive(guildId: string, active: boolean): void {
  getDb().prepare('UPDATE monitors SET active = ? WHERE guild_id = ?').run(active ? 1 : 0, guildId);
}

export function touchMonitor(guildId: string): void {
  getDb().prepare('UPDATE monitors SET last_check = CURRENT_TIMESTAMP WHERE guild_id = ?').run(guildId);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SlipRow {
  id: number;
  user_id: string;
  guild_id: string;
  channel_id: string;
  type: 'single' | 'parlay';
  wager: number;
  to_win: number | null;
  odds: number | null;
  status: 'active' | 'won' | 'lost' | 'push' | 'void';
  source: 'manual' | 'image' | 'text';
  created_at: string;
  settled_at: string | null;
}

export interface LegRow {
  id: number;
  slip_id: number;
  type: 'prop' | 'moneyline' | 'spread' | 'total';
  player: string | null;
  team: string | null;
  stat: string | null;
  line: number | null;
  direction: 'over' | 'under' | null;
  game_id: string | null;
  sport: string;
  status: 'pending' | 'hit' | 'miss' | 'push' | 'void';
  current_value: number | null;
  odds: number | null;
  settled_at: string | null;
}

export interface MonitorRow {
  id: number;
  guild_id: string;
  channel_id: string;
  user_id: string;
  interval_ms: number;
  active: number;
  last_check: string | null;
  created_at: string;
}
