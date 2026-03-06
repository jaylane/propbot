import type { StatKey } from '../models/bet.js';
import type { BoxScore } from '../models/game.js';
import { getLegs, updateLeg, updateSlipStatus, getSlip, type LegRow } from '../db/index.js';
import { getBoxScore, findPlayer, getStatValue } from './espn.js';
import { STAT_ALIASES } from '../utils/constants.js';

export interface LegEvaluation {
  legId: number;
  slipId: number;
  player: string;
  stat: StatKey;
  line: number;
  direction: 'over' | 'under';
  currentValue: number;
  status: 'pending' | 'hit' | 'miss' | 'push';
  gameStatus: string;
  isGameFinal: boolean;
  progress: string; // e.g. "18.5 / 25.5 O"
}

// Evaluate all legs on a slip
export async function evaluateSlip(slipId: number): Promise<LegEvaluation[]> {
  const legs = getLegs(slipId);
  const results: LegEvaluation[] = [];

  for (const leg of legs) {
    if (leg.type !== 'prop' || !leg.game_id || !leg.stat || leg.line === null) continue;
    const result = await evaluateLeg(leg);
    if (result) results.push(result);
  }

  // Settle the slip if all legs are resolved
  await maybeSettleSlip(slipId);

  return results;
}

export async function evaluateLeg(leg: LegRow): Promise<LegEvaluation | null> {
  if (!leg.game_id || !leg.stat || leg.line === null || !leg.direction) return null;

  const sport = leg.sport as any;
  const boxScore: BoxScore | null = await getBoxScore(leg.game_id, sport);
  if (!boxScore) return null;

  const playerName = leg.player ?? '';
  const player = findPlayer(boxScore, playerName);

  const statKey = (STAT_ALIASES[leg.stat.toLowerCase()] ?? leg.stat) as StatKey;
  const currentValue = player ? getStatValue(player, statKey) : 0;
  const isGameFinal = boxScore.game.status === 'final';

  let status: 'pending' | 'hit' | 'miss' | 'push' = 'pending';

  if (isGameFinal || (player && !player.minutesPlayed && boxScore.game.status === 'final')) {
    if (currentValue === leg.line) {
      status = 'push';
    } else if (leg.direction === 'over' && currentValue > leg.line) {
      status = 'hit';
    } else if (leg.direction === 'under' && currentValue < leg.line) {
      status = 'hit';
    } else {
      status = 'miss';
    }
  }

  // Update DB if changed
  if (status !== leg.status || Math.abs(currentValue - (leg.current_value ?? -999)) > 0.01) {
    updateLeg(leg.id, { status: isGameFinal ? status : undefined, currentValue });
  }

  const lineStr = `${leg.direction === 'over' ? 'O' : 'U'}${leg.line}`;
  const progress = `${currentValue} / ${lineStr}`;

  return {
    legId: leg.id,
    slipId: leg.slip_id,
    player: playerName,
    stat: statKey,
    line: leg.line,
    direction: leg.direction as 'over' | 'under',
    currentValue,
    status,
    gameStatus: boxScore.game.status,
    isGameFinal,
    progress,
  };
}

// Settle the full slip based on leg outcomes
async function maybeSettleSlip(slipId: number): Promise<void> {
  const slip = getSlip(slipId);
  if (!slip || slip.status !== 'active') return;

  const legs = getLegs(slipId);
  const relevant = legs.filter(l => l.type === 'prop');
  if (!relevant.length) return;

  const allSettled = relevant.every(l => l.status !== 'pending');
  if (!allSettled) return;

  if (slip.type === 'parlay') {
    const anyMiss = relevant.some(l => l.status === 'miss');
    const anyPush = relevant.some(l => l.status === 'push');
    const allHit = relevant.every(l => l.status === 'hit' || l.status === 'push');

    if (anyMiss) {
      updateSlipStatus(slipId, 'lost');
    } else if (allHit && anyPush) {
      updateSlipStatus(slipId, 'push');
    } else if (allHit) {
      updateSlipStatus(slipId, 'won');
    }
  } else {
    // Single
    const leg = relevant[0];
    if (leg.status === 'hit') updateSlipStatus(slipId, 'won');
    else if (leg.status === 'miss') updateSlipStatus(slipId, 'lost');
    else if (leg.status === 'push') updateSlipStatus(slipId, 'push');
  }
}

// Normalize a stat key string from user input
export function resolveStatKey(input: string): StatKey | null {
  const lower = input.toLowerCase().trim().replace(/\s+/g, '');
  return (STAT_ALIASES[lower] ?? null) as StatKey | null;
}

// Calculate implied probability from American odds
export function impliedProbability(americanOdds: number): number {
  if (americanOdds > 0) return 100 / (americanOdds + 100);
  return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
}

// Calculate potential payout from American odds + wager
export function calculatePayout(wager: number, americanOdds: number): number {
  if (americanOdds > 0) return wager * (americanOdds / 100);
  return wager * (100 / Math.abs(americanOdds));
}

// Format American odds with sign
export function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}
