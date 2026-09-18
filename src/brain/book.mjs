import {
  MIN_BNB,
  MIN_TOKEN,
  START_BNB,
  START_PRICE,
  TOKEN_UNIT,
  equityOf,
} from "../swarm.mjs";

export function emptyBook() {
  return {
    bnb: 0,
    token: 0,
    costBnb: 0,
    trades: 0,
    wins: 0,
    losses: 0,
    realized: 0,
  };
}

export function seedBook() {
  const reserved = Math.trunc((START_BNB * 35) / 100);
  const token = Math.trunc((reserved * TOKEN_UNIT) / START_PRICE);
  const spent = Math.trunc((token * START_PRICE) / TOKEN_UNIT);
  return {
    bnb: START_BNB - spent,
    token,
    costBnb: spent,
    trades: 0,
    wins: 0,
    losses: 0,
    realized: 0,
  };
}

/** Paper fill. Settlement adapters may replace this later. */
export function fillBook(book, price, intent, tick, flyId, meta = {}) {
  if (intent.side === "HOLD") return null;
  const tag = {
    assetId: meta.assetId || null,
    mid: meta.mid ?? null,
    quoteSource: meta.quoteSource || "paper",
    quote: meta.quote || "SIM",
    fill: "SIM",
  };
  if (intent.side === "BUY") {
    const spend = Math.max(MIN_BNB, Math.min(book.bnb, Math.trunc((book.bnb * intent.confidence * 8) / 1000)));
    if (book.bnb < spend || spend < MIN_BNB) return null;
    const slipped = Math.max(1, Math.trunc((price * 10200) / 10000));
    const tokens = Math.trunc((Math.trunc((spend * 9500) / 10000) * TOKEN_UNIT) / slipped);
    if (!tokens) return null;
    book.bnb -= spend;
    book.token += tokens;
    book.costBnb += spend;
    book.trades += 1;
    return {
      tick,
      flyId,
      side: "BUY",
      amount: spend,
      contra: tokens,
      status: "confirmed",
      audit: "SIM",
      ...tag,
    };
  }
  const tokens = Math.max(MIN_TOKEN, Math.min(book.token, Math.trunc((book.token * intent.confidence * 8) / 1000)));
  if (book.token < tokens || tokens < MIN_TOKEN) return null;
  const slipped = Math.max(1, Math.trunc((price * 9800) / 10000));
  const received = Math.trunc((Math.trunc((tokens * slipped) / TOKEN_UNIT) * 9500) / 10000);
  const basis = book.token ? Math.trunc((book.costBnb * tokens) / book.token) : 0;
  book.bnb += received;
  book.token -= tokens;
  book.costBnb = Math.max(0, book.costBnb - basis);
  book.realized += received - basis;
  if (received >= basis) book.wins += 1;
  else book.losses += 1;
  book.trades += 1;
  return {
    tick,
    flyId,
    side: "SELL",
    amount: tokens,
    contra: received,
    status: "confirmed",
    audit: "SIM",
    ...tag,
  };
}

export function navOf(book, price) {
  return equityOf(book, price);
}
