import type { Sport, StatKey } from '../models/bet.js';

export const SPORT_PATHS: Record<Sport, string> = {
  nba: 'basketball/nba',
  ncaab: 'basketball/mens-college-basketball',
  nfl: 'football/nfl',
  mlb: 'baseball/mlb',
  nhl: 'hockey/nhl',
};

// ESPN stat indices for basketball box scores
export const ESPN_STAT_INDEX: Record<string, number> = {
  MIN: 0,
  PTS: 1,
  FG: 2,
  '3PT': 3,
  FT: 4,
  REB: 5,
  AST: 6,
  TO: 7,
  STL: 8,
  BLK: 9,
  OREB: 10,
  DREB: 11,
  PF: 12,
  PM: 13,
};

export const STAT_DISPLAY: Record<StatKey, string> = {
  points: 'Points',
  rebounds: 'Rebounds',
  assists: 'Assists',
  threePointers: '3-Pointers Made',
  steals: 'Steals',
  blocks: 'Blocks',
  turnovers: 'Turnovers',
  pra: 'Pts+Reb+Ast',
  ra: 'Reb+Ast',
  pa: 'Pts+Ast',
  pr: 'Pts+Reb',
  hits: 'Hits',
  strikeouts: 'Strikeouts',
  goals: 'Goals',
  saves: 'Saves',
  passingYards: 'Passing Yards',
  rushingYards: 'Rushing Yards',
  receivingYards: 'Receiving Yards',
  touchdowns: 'Touchdowns',
};

export const STAT_ALIASES: Record<string, StatKey> = {
  pts: 'points',
  points: 'points',
  point: 'points',
  reb: 'rebounds',
  rebs: 'rebounds',
  rebounds: 'rebounds',
  ast: 'assists',
  asts: 'assists',
  assists: 'assists',
  '3pm': 'threePointers',
  '3p': 'threePointers',
  threes: 'threePointers',
  threepointers: 'threePointers',
  '3pointers': 'threePointers',
  '3-pointers': 'threePointers',
  stl: 'steals',
  steals: 'steals',
  blk: 'blocks',
  blocks: 'blocks',
  to: 'turnovers',
  turnovers: 'turnovers',
  pra: 'pra',
  'pts+reb+ast': 'pra',
  ra: 'ra',
  'reb+ast': 'ra',
  pa: 'pa',
  'pts+ast': 'pa',
  pr: 'pr',
  'pts+reb': 'pr',
};

export const COLORS = {
  HIT: 0x57f287,       // Green
  MISS: 0xed4245,      // Red
  PENDING: 0xfee75c,   // Yellow
  ACTIVE: 0x5865f2,    // Discord Blurple
  NEUTRAL: 0x99aab5,   // Gray
  WIN: 0x57f287,
  LOSS: 0xed4245,
  PUSH: 0xfee75c,
};

export const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

export const VALID_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
];
