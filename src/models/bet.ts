export type Sport = 'nba' | 'ncaab' | 'nfl' | 'mlb' | 'nhl';

export type StatKey =
  | 'points'
  | 'rebounds'
  | 'assists'
  | 'threePointers'
  | 'steals'
  | 'blocks'
  | 'turnovers'
  | 'pra'
  | 'ra'
  | 'pa'
  | 'pr'
  | 'hits'
  | 'strikeouts'
  | 'goals'
  | 'saves'
  | 'passingYards'
  | 'rushingYards'
  | 'receivingYards'
  | 'touchdowns';

export type LegType = 'prop' | 'moneyline' | 'spread' | 'total';
export type Direction = 'over' | 'under';
export type LegStatus = 'pending' | 'hit' | 'miss' | 'push' | 'void';
export type SlipStatus = 'active' | 'won' | 'lost' | 'push' | 'void';
export type SlipType = 'single' | 'parlay';

export interface PropLeg {
  id?: number;
  slipId?: number;
  type: LegType;
  player?: string;
  team?: string;
  stat?: StatKey;
  line?: number;
  direction?: Direction;
  gameId?: string;
  sport: Sport;
  status: LegStatus;
  currentValue?: number;
  odds?: number;
}

export interface Slip {
  id?: number;
  userId: string;
  guildId: string;
  channelId: string;
  type: SlipType;
  wager: number;
  toWin?: number;
  odds?: number;
  status: SlipStatus;
  source: 'manual' | 'image' | 'text';
  legs: PropLeg[];
  createdAt?: string;
  settledAt?: string;
}

// Parsed from AI vision or text
export interface ParsedSlip {
  type: SlipType;
  wager: number;
  toWin?: number;
  odds?: number;
  legs: ParsedLeg[];
}

export interface ParsedLeg {
  type: LegType;
  player?: string;
  team?: string;
  stat?: string;
  line?: number;
  direction?: Direction;
  gameDescription?: string;
  odds?: number;
  rawText?: string;
}
