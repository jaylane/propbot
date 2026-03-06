import { EmbedBuilder } from 'discord.js';
import type { LegEvaluation } from '../services/prop-tracker.js';
import type { SlipRow, LegRow } from '../db/index.js';
import { COLORS, STAT_DISPLAY } from './constants.js';
import { formatOdds } from '../services/prop-tracker.js';
import type { StatKey } from '../models/bet.js';

// ── Status Embed (live update) ─────────────────────────────────────────────────

export function buildStatusEmbed(
  slip: SlipRow,
  legs: LegRow[],
  evals: LegEvaluation[],
): EmbedBuilder | null {
  if (!evals.length) return null;

  // Any in-progress game?
  const hasLive = evals.some(e => e.gameStatus === 'in_progress' || e.gameStatus === 'halftime');
  if (!hasLive && evals.every(e => e.isGameFinal)) return null; // settled, handled elsewhere

  const allHit = evals.every(e => e.status === 'hit');
  const anyMiss = evals.some(e => e.status === 'miss');
  const color = allHit ? COLORS.HIT : anyMiss ? COLORS.MISS : COLORS.PENDING;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📊 Slip #${slip.id} — Live Update`)
    .setFooter({ text: `$${slip.wager} wager${slip.to_win ? ` · to win $${slip.to_win.toFixed(2)}` : ''}` })
    .setTimestamp();

  for (const ev of evals) {
    const icon = ev.status === 'hit' ? '✅' : ev.status === 'miss' ? '❌' : ev.status === 'push' ? '🔄' : '⏳';
    const statName = STAT_DISPLAY[ev.stat] ?? ev.stat;
    const dir = ev.direction === 'over' ? 'O' : 'U';
    embed.addFields({
      name: `${icon} ${ev.player}`,
      value: `${statName} ${dir}${ev.line} · **${ev.currentValue}** (${ev.gameStatus})`,
      inline: true,
    });
  }

  return embed;
}

// ── Settled Embed ─────────────────────────────────────────────────────────────

export function buildSettledEmbed(slip: SlipRow, legs: LegRow[]): EmbedBuilder {
  const statusEmoji = slip.status === 'won' ? '🎉' : slip.status === 'lost' ? '💀' : '🔄';
  const statusText = slip.status === 'won' ? 'WON' : slip.status === 'lost' ? 'LOST' : 'PUSH';
  const color = slip.status === 'won' ? COLORS.WIN : slip.status === 'lost' ? COLORS.LOSS : COLORS.PUSH;

  const pnl = slip.status === 'won'
    ? `+$${(slip.to_win ?? 0).toFixed(2)}`
    : slip.status === 'lost'
      ? `-$${slip.wager.toFixed(2)}`
      : `±$0 (push)`;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${statusEmoji} Slip #${slip.id} — ${statusText}`)
    .setDescription(`**${pnl}**`)
    .setFooter({ text: `$${slip.wager} wager · ${slip.type} bet` })
    .setTimestamp();

  for (const leg of legs) {
    if (leg.type !== 'prop') continue;
    const icon = leg.status === 'hit' ? '✅' : leg.status === 'miss' ? '❌' : leg.status === 'push' ? '🔄' : '⏳';
    const statName = STAT_DISPLAY[leg.stat as StatKey] ?? leg.stat ?? '?';
    const dir = leg.direction === 'over' ? 'O' : 'U';
    embed.addFields({
      name: `${icon} ${leg.player ?? '?'}`,
      value: `${statName} ${dir}${leg.line} · Final: **${leg.current_value ?? '?'}**`,
      inline: true,
    });
  }

  return embed;
}

// ── Prop List Embed ────────────────────────────────────────────────────────────

export function buildPropListEmbed(slips: SlipRow[], legsMap: Map<number, LegRow[]>): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.ACTIVE)
    .setTitle('📋 Active Bets')
    .setTimestamp();

  if (!slips.length) {
    embed.setDescription('No active bets. Use `/prop add` or `/parlay` to get started.');
    return embed;
  }

  for (const slip of slips) {
    const legs = legsMap.get(slip.id) ?? [];
    const legStrs = legs
      .filter(l => l.type === 'prop')
      .map(l => {
        const icon = l.status === 'hit' ? '✅' : l.status === 'miss' ? '❌' : '⏳';
        const statName = STAT_DISPLAY[l.stat as StatKey] ?? l.stat ?? '?';
        const dir = l.direction === 'over' ? 'O' : 'U';
        const cur = l.current_value !== null ? ` (cur: ${l.current_value})` : '';
        return `${icon} ${l.player ?? '?'} ${statName} ${dir}${l.line}${cur}`;
      })
      .join('\n');

    embed.addFields({
      name: `Slip #${slip.id} · ${slip.type.toUpperCase()} · $${slip.wager}${slip.to_win ? ` → $${slip.to_win.toFixed(2)}` : ''}`,
      value: legStrs || 'No prop legs',
      inline: false,
    });
  }

  return embed;
}

// ── Odds Embed ─────────────────────────────────────────────────────────────────

export function buildOddsEmbed(
  title: string,
  outcomes: Array<{ bookmaker: string; team: string; price: number; point?: number }>,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.ACTIVE)
    .setTitle(`📈 Odds: ${title}`)
    .setTimestamp();

  const byBook = new Map<string, typeof outcomes>();
  for (const o of outcomes) {
    if (!byBook.has(o.bookmaker)) byBook.set(o.bookmaker, []);
    byBook.get(o.bookmaker)!.push(o);
  }

  for (const [book, lines] of byBook) {
    const text = lines.map(l => `${l.team}: **${formatOdds(l.price)}**${l.point !== undefined ? ` (${l.point > 0 ? '+' : ''}${l.point})` : ''}`).join('\n');
    embed.addFields({ name: book, value: text, inline: true });
  }

  return embed;
}

// ── Error Embed ────────────────────────────────────────────────────────────────

export function buildErrorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.MISS)
    .setTitle('❌ Error')
    .setDescription(message);
}

// ── Success Embed ──────────────────────────────────────────────────────────────

export function buildSuccessEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.HIT)
    .setTitle(`✅ ${title}`)
    .setDescription(description);
}

// ── Slip Added Embed ───────────────────────────────────────────────────────────

export function buildSlipAddedEmbed(slipId: number, slip: SlipRow, legs: LegRow[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.ACTIVE)
    .setTitle(`🎯 Slip #${slipId} Tracked`)
    .setDescription(`**${slip.type.toUpperCase()}** · $${slip.wager} wager${slip.to_win ? ` · to win $${slip.to_win.toFixed(2)}` : ''}`)
    .setTimestamp();

  for (const leg of legs) {
    if (leg.type !== 'prop') continue;
    const statName = STAT_DISPLAY[leg.stat as StatKey] ?? leg.stat ?? '?';
    const dir = leg.direction === 'over' ? 'OVER' : 'UNDER';
    const oddsStr = leg.odds ? ` · ${formatOdds(leg.odds)}` : '';
    embed.addFields({
      name: `${leg.player ?? '?'}`,
      value: `${statName} **${dir} ${leg.line}**${oddsStr}`,
      inline: true,
    });
  }

  return embed;
}
