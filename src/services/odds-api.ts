/**
 * The Odds API client — BYOK (user brings their own key).
 * Docs: https://the-odds-api.com/lob/sports-odds-api.html
 */

const BASE_URL = 'https://api.the-odds-api.com/v4';

export interface OddsOutcome {
  bookmaker: string;
  team: string;
  price: number;
  point?: number;
}

export interface OddsResult {
  game: string;
  market: string;
  outcomes: OddsOutcome[];
  remainingRequests: number;
}

type Market = 'h2h' | 'spreads' | 'totals';

const SPORT_KEYS: Record<string, string> = {
  nba: 'basketball_nba',
  ncaab: 'basketball_ncaab',
  nfl: 'americanfootball_nfl',
  mlb: 'baseball_mlb',
  nhl: 'icehockey_nhl',
};

async function fetchOdds(apiKey: string, url: string): Promise<{ data: any; remaining: number }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PropBot/1.0' },
    signal: AbortSignal.timeout(10_000),
  });

  const remaining = parseInt(res.headers.get('x-requests-remaining') ?? '0', 10);

  if (res.status === 401) throw new Error('Invalid Odds API key. Update it with `/settings oddskey:`.');
  if (res.status === 429) throw new Error('Odds API rate limit reached. Try again later.');
  if (!res.ok) throw new Error(`Odds API error ${res.status}`);

  const data = await res.json();
  return { data, remaining };
}

export async function getOdds(
  apiKey: string,
  sport: string,
  gameQuery: string,
  market: Market = 'h2h',
): Promise<OddsResult | null> {
  const sportKey = SPORT_KEYS[sport] ?? sport;
  const url = `${BASE_URL}/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=us&markets=${market}&oddsFormat=american`;

  const { data, remaining } = await fetchOdds(apiKey, url);
  const events: any[] = data ?? [];

  if (!events.length) return null;

  // Find matching event
  const q = gameQuery.toLowerCase();
  const event = events.find((e: any) => {
    const home = (e.home_team ?? '').toLowerCase();
    const away = (e.away_team ?? '').toLowerCase();
    return home.includes(q) || away.includes(q) ||
      `${away} vs ${home}`.includes(q) ||
      q.includes(home.split(' ').pop()!) ||
      q.includes(away.split(' ').pop()!);
  });

  if (!event) return null;

  const outcomes: OddsOutcome[] = [];
  for (const bookmaker of event.bookmakers ?? []) {
    const mkt = bookmaker.markets?.find((m: any) => m.key === market);
    if (!mkt) continue;
    for (const outcome of mkt.outcomes ?? []) {
      outcomes.push({
        bookmaker: bookmaker.title,
        team: outcome.name,
        price: outcome.price,
        point: outcome.point,
      });
    }
  }

  const gameStr = `${event.away_team} @ ${event.home_team}`;
  return {
    game: gameStr,
    market,
    outcomes,
    remainingRequests: remaining,
  };
}

export async function getSports(apiKey: string): Promise<string[]> {
  const { data } = await fetchOdds(apiKey, `${BASE_URL}/sports/?apiKey=${apiKey}`);
  return (data as any[]).filter((s: any) => s.active).map((s: any) => s.key);
}
