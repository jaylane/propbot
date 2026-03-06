import type { Sport } from './bet.js';

export type GameStatus = 'scheduled' | 'in_progress' | 'halftime' | 'final' | 'postponed' | 'cancelled';

export interface Game {
  id: string;
  sport: Sport;
  status: GameStatus;
  period: number;
  clock: string;
  homeTeam: Team;
  awayTeam: Team;
  startTime: string;
}

export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  score: number;
}

export interface PlayerStats {
  playerId: string;
  name: string;
  teamId: string;
  gameId: string;
  stats: Record<string, number>;
  // Computed props
  points: number;
  rebounds: number;
  assists: number;
  threePointers: number;
  steals: number;
  blocks: number;
  turnovers: number;
  offRebounds: number;
  defRebounds: number;
  minutesPlayed: number;
  // Combos
  pra: number;
  ra: number;
  pa: number;
  pr: number;
  // MLB
  hits?: number;
  strikeouts?: number;
  // NHL
  goals?: number;
  saves?: number;
  // NFL
  passingYards?: number;
  rushingYards?: number;
  receivingYards?: number;
  touchdowns?: number;
}

export interface BoxScore {
  gameId: string;
  sport: Sport;
  game: Game;
  players: PlayerStats[];
  fetchedAt: number;
}
