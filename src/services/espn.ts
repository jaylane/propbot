import type { Sport, StatKey } from '../models/bet.js';
import type { BoxScore, Game, GameStatus, PlayerStats, Team } from '../models/game.js';
import { ESPN_BASE, ESPN_STAT_INDEX, SPORT_PATHS } from '../utils/constants.js';

const CACHE_TTL_MS = 30_000; // 30s for in-progress games
const FINAL_CACHE_TTL_MS = 300_000; // 5m for finished games
const cache = new Map<string, { data: BoxScore; ts: number }>();

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PropBot/1.0 Discord Sports Tracker' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ESPN API ${res.status}: ${url}`);
  return res.json();
}

// ── Scoreboard ────────────────────────────────────────────────────────────────

export async function getScoreboard(sport: Sport, date?: string): Promise<Game[]> {
  const dateStr = date ?? todayEST();
  const path = SPORT_PATHS[sport];
  let url = `${ESPN_BASE}/${path}/scoreboard?dates=${dateStr}&limit=50`;

  // NCAAB conference tournaments need seasontype=3
  if (sport === 'ncaab') {
    url += '&groups=50&seasontype=3';
  }

  try {
    const data = await fetchJson(url) as any;
    return (data.events ?? []).map(parseGame);
  } catch (err) {
    // Fall back to regular season for NCAAB
    if (sport === 'ncaab') {
      url = `${ESPN_BASE}/${path}/scoreboard?dates=${dateStr}&groups=50&limit=50`;
      const data = await fetchJson(url) as any;
      return (data.events ?? []).map(parseGame);
    }
    throw err;
  }
}

// ── Box Score ─────────────────────────────────────────────────────────────────

export async function getBoxScore(gameId: string, sport: Sport): Promise<BoxScore | null> {
  const key = `${sport}:${gameId}`;
  const cached = cache.get(key);

  if (cached) {
    const ttl = cached.data.game.status === 'final' ? FINAL_CACHE_TTL_MS : CACHE_TTL_MS;
    if (Date.now() - cached.ts < ttl) return cached.data;
  }

  try {
    const path = SPORT_PATHS[sport];
    const data = await fetchJson(`${ESPN_BASE}/${path}/summary?event=${gameId}`) as any;
    const boxScore = parseBoxScore(gameId, sport, data);
    cache.set(key, { data: boxScore, ts: Date.now() });
    return boxScore;
  } catch (err) {
    console.error(`[ESPN] Failed to fetch box score for ${gameId}:`, err);
    return null;
  }
}

// ── Player Lookup ─────────────────────────────────────────────────────────────

export function findPlayer(boxScore: BoxScore, playerName: string): PlayerStats | null {
  const normalized = normalize(playerName);
  // Exact match first
  let match = boxScore.players.find(p => normalize(p.name) === normalized);
  if (match) return match;

  // Last name match
  const lastName = normalized.split(' ').pop() ?? normalized;
  const lastNameMatches = boxScore.players.filter(p =>
    normalize(p.name).endsWith(` ${lastName}`) || normalize(p.name) === lastName
  );
  if (lastNameMatches.length === 1) return lastNameMatches[0];

  // Partial match
  match = boxScore.players.find(p => normalize(p.name).includes(normalized) || normalized.includes(normalize(p.name)));
  return match ?? null;
}

export function getStatValue(player: PlayerStats, stat: StatKey): number {
  switch (stat) {
    case 'points': return player.points;
    case 'rebounds': return player.rebounds;
    case 'assists': return player.assists;
    case 'threePointers': return player.threePointers;
    case 'steals': return player.steals;
    case 'blocks': return player.blocks;
    case 'turnovers': return player.turnovers;
    case 'pra': return player.pra;
    case 'ra': return player.ra;
    case 'pa': return player.pa;
    case 'pr': return player.pr;
    case 'hits': return player.hits ?? 0;
    case 'strikeouts': return player.strikeouts ?? 0;
    case 'goals': return player.goals ?? 0;
    case 'saves': return player.saves ?? 0;
    case 'passingYards': return player.passingYards ?? 0;
    case 'rushingYards': return player.rushingYards ?? 0;
    case 'receivingYards': return player.receivingYards ?? 0;
    case 'touchdowns': return player.touchdowns ?? 0;
    default: return 0;
  }
}

// ── Game search ───────────────────────────────────────────────────────────────

export async function findGame(sport: Sport, query: string): Promise<Game | null> {
  const games = await getScoreboard(sport);
  if (!games.length) return null;

  const q = normalize(query);

  // Try matching "AWAY@HOME" or "AWAY vs HOME" pattern
  for (const game of games) {
    const matchStr = `${game.awayTeam.abbreviation}@${game.homeTeam.abbreviation}`;
    const vsStr = `${game.awayTeam.name} vs ${game.homeTeam.name}`;

    if (
      normalize(matchStr).includes(q) ||
      q.includes(normalize(game.awayTeam.abbreviation)) ||
      q.includes(normalize(game.homeTeam.abbreviation)) ||
      normalize(vsStr).includes(q)
    ) {
      return game;
    }
  }
  return null;
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseGame(event: any): Game {
  const comp = event.competitions?.[0];
  const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
  const status = event.status?.type;

  return {
    id: event.id,
    sport: 'nba', // overridden at call site
    status: parseStatus(status?.name),
    period: status?.period ?? 0,
    clock: status?.displayClock ?? '',
    startTime: event.date,
    homeTeam: parseTeam(home),
    awayTeam: parseTeam(away),
  };
}

function parseTeam(competitor: any): Team {
  return {
    id: competitor?.team?.id ?? '',
    name: competitor?.team?.displayName ?? '',
    abbreviation: competitor?.team?.abbreviation ?? '',
    score: parseInt(competitor?.score ?? '0', 10),
  };
}

function parseStatus(name?: string): GameStatus {
  if (!name) return 'scheduled';
  const n = name.toLowerCase();
  if (n.includes('final')) return 'final';
  if (n.includes('half')) return 'halftime';
  if (n.includes('progress') || n.includes('live')) return 'in_progress';
  if (n.includes('postponed')) return 'postponed';
  if (n.includes('cancel')) return 'cancelled';
  return 'scheduled';
}

function parseBoxScore(gameId: string, sport: Sport, data: any): BoxScore {
  const game = parseGame(data.header?.competitions?.[0]
    ? { id: gameId, ...data.header, status: data.header.competitions[0].status, competitions: data.header.competitions }
    : { id: gameId, status: { type: { name: 'STATUS_FINAL', period: 0, displayClock: '' } }, competitions: [], date: '' });

  const players: PlayerStats[] = [];

  // Basketball
  if (sport === 'nba' || sport === 'ncaab') {
    const boxscores = data.boxscore?.players ?? [];
    for (const teamEntry of boxscores) {
      const teamId = teamEntry.team?.id ?? '';
      for (const category of teamEntry.statistics ?? []) {
        for (const athlete of category.athletes ?? []) {
          const stats = athlete.stats ?? [];
          if (!stats.length) continue;
          const p = parseBasketballPlayer(athlete.athlete, teamId, gameId, stats);
          players.push(p);
        }
      }
    }
  }

  // NFL
  if (sport === 'nfl') {
    const boxscores = data.boxscore?.players ?? [];
    for (const teamEntry of boxscores) {
      const teamId = teamEntry.team?.id ?? '';
      for (const category of teamEntry.statistics ?? []) {
        for (const athlete of category.athletes ?? []) {
          const p = parseNFLPlayer(athlete.athlete, teamId, gameId, category.name, athlete.stats ?? []);
          if (p) {
            const existing = players.find(x => x.playerId === p.playerId);
            if (existing) mergeNFLStats(existing, p);
            else players.push(p);
          }
        }
      }
    }
  }

  return { gameId, sport, game, players, fetchedAt: Date.now() };
}

function parseBasketballPlayer(athlete: any, teamId: string, gameId: string, stats: string[]): PlayerStats {
  const pts = parseFloat(stats[ESPN_STAT_INDEX.PTS] ?? '0') || 0;
  const reb = parseFloat(stats[ESPN_STAT_INDEX.REB] ?? '0') || 0;
  const ast = parseFloat(stats[ESPN_STAT_INDEX.AST] ?? '0') || 0;
  const stl = parseFloat(stats[ESPN_STAT_INDEX.STL] ?? '0') || 0;
  const blk = parseFloat(stats[ESPN_STAT_INDEX.BLK] ?? '0') || 0;
  const to = parseFloat(stats[ESPN_STAT_INDEX.TO] ?? '0') || 0;
  const oreb = parseFloat(stats[ESPN_STAT_INDEX.OREB] ?? '0') || 0;
  const dreb = parseFloat(stats[ESPN_STAT_INDEX.DREB] ?? '0') || 0;
  const minStr = stats[ESPN_STAT_INDEX.MIN] ?? '0';
  const min = parseFloat(minStr) || 0;

  // 3PT field: "made-attempted" e.g. "4-7" → 4 made
  const threePtStr = stats[ESPN_STAT_INDEX['3PT']] ?? '0';
  const threePointers = parseInt(threePtStr.split('-')[0] ?? '0', 10) || 0;

  return {
    playerId: athlete?.id ?? '',
    name: athlete?.displayName ?? athlete?.shortName ?? '',
    teamId,
    gameId,
    stats: {},
    points: pts,
    rebounds: reb,
    assists: ast,
    threePointers,
    steals: stl,
    blocks: blk,
    turnovers: to,
    offRebounds: oreb,
    defRebounds: dreb,
    minutesPlayed: min,
    pra: pts + reb + ast,
    ra: reb + ast,
    pa: pts + ast,
    pr: pts + reb,
  };
}

function parseNFLPlayer(athlete: any, teamId: string, gameId: string, category: string, stats: string[]): PlayerStats | null {
  if (!athlete) return null;

  const base: PlayerStats = {
    playerId: athlete.id ?? '',
    name: athlete.displayName ?? '',
    teamId,
    gameId,
    stats: {},
    points: 0, rebounds: 0, assists: 0, threePointers: 0,
    steals: 0, blocks: 0, turnovers: 0, offRebounds: 0, defRebounds: 0, minutesPlayed: 0,
    pra: 0, ra: 0, pa: 0, pr: 0,
    passingYards: 0, rushingYards: 0, receivingYards: 0, touchdowns: 0,
  };

  const cat = (category ?? '').toLowerCase();
  if (cat === 'passing') {
    base.passingYards = parseFloat(stats[1] ?? '0') || 0;
    base.touchdowns = (base.touchdowns ?? 0) + (parseInt(stats[4] ?? '0', 10) || 0);
  } else if (cat === 'rushing') {
    base.rushingYards = parseFloat(stats[1] ?? '0') || 0;
    base.touchdowns = (base.touchdowns ?? 0) + (parseInt(stats[3] ?? '0', 10) || 0);
  } else if (cat === 'receiving') {
    base.receivingYards = parseFloat(stats[2] ?? '0') || 0;
    base.touchdowns = (base.touchdowns ?? 0) + (parseInt(stats[4] ?? '0', 10) || 0);
  } else {
    return null;
  }
  return base;
}

function mergeNFLStats(target: PlayerStats, source: PlayerStats): void {
  target.passingYards = (target.passingYards ?? 0) + (source.passingYards ?? 0);
  target.rushingYards = (target.rushingYards ?? 0) + (source.rushingYards ?? 0);
  target.receivingYards = (target.receivingYards ?? 0) + (source.receivingYards ?? 0);
  target.touchdowns = (target.touchdowns ?? 0) + (source.touchdowns ?? 0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
}

function todayEST(): string {
  const now = new Date();
  const est = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return est.toISOString().slice(0, 10).replace(/-/g, '');
}
