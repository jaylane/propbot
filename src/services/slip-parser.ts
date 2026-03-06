import OpenAI from 'openai';
import type { ParsedSlip, ParsedLeg } from '../models/bet.js';

const SYSTEM_PROMPT = `You are a sports betting slip parser. Extract all bets from the provided image.

Return a JSON object with this structure:
{
  "type": "single" | "parlay",
  "wager": number,
  "toWin": number | null,
  "odds": number | null,
  "legs": [
    {
      "type": "prop" | "moneyline" | "spread" | "total",
      "player": string | null,
      "team": string | null,
      "stat": string | null,
      "line": number | null,
      "direction": "over" | "under" | null,
      "gameDescription": string | null,
      "odds": number | null,
      "rawText": string
    }
  ]
}

For stat names, use these standard keys: points, rebounds, assists, threePointers, steals, blocks, turnovers, pra, ra, pa, pr
If you see "3PM" or "3-Pointers Made" use "threePointers".
If you see "Pts+Reb+Ast" use "pra".
For MLB: hits, strikeouts, homeRuns
For NFL: passingYards, rushingYards, receivingYards, touchdowns
For NHL: goals, saves, assists

For odds: use American format (negative for favorites, e.g. -110, +150).
Return ONLY the JSON, no markdown fences.`;

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set — required for bet slip parsing');
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

export async function parseSlipImage(imageUrl: string): Promise<ParsedSlip> {
  const openai = getOpenAI();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: SYSTEM_PROMPT },
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content ?? '';
  return parseJSON(content);
}

export async function parseSlipText(text: string): Promise<ParsedSlip> {
  const openai = getOpenAI();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 1500,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Parse this bet slip text:\n\n${text}` },
    ],
  });

  const content = response.choices[0]?.message?.content ?? '';
  return parseJSON(content);
}

function parseJSON(content: string): ParsedSlip {
  // Strip markdown fences if present
  const cleaned = content.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Failed to parse AI response as JSON: ${content.slice(0, 200)}`);
  }

  // Validate and normalize
  const slip: ParsedSlip = {
    type: parsed.type === 'parlay' ? 'parlay' : 'single',
    wager: parseFloat(parsed.wager) || 0,
    toWin: parsed.toWin ? parseFloat(parsed.toWin) : undefined,
    odds: parsed.odds ? parseInt(parsed.odds) : undefined,
    legs: [],
  };

  for (const leg of (parsed.legs ?? [])) {
    const parsedLeg: ParsedLeg = {
      type: leg.type ?? 'prop',
      player: leg.player ?? undefined,
      team: leg.team ?? undefined,
      stat: leg.stat ?? undefined,
      line: leg.line !== null && leg.line !== undefined ? parseFloat(leg.line) : undefined,
      direction: leg.direction === 'over' || leg.direction === 'under' ? leg.direction : undefined,
      gameDescription: leg.gameDescription ?? undefined,
      odds: leg.odds ? parseInt(leg.odds) : undefined,
      rawText: leg.rawText ?? '',
    };
    slip.legs.push(parsedLeg);
  }

  return slip;
}
