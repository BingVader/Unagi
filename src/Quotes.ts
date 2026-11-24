export interface Quote {
  text: string;
  author: string;
}

/** Shown when offline, rate-limited or the online sources are unavailable. Short, well-known, attributed. */
const OFFLINE: Quote[] = [
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'It always seems impossible until it is done.', author: 'Nelson Mandela' },
  { text: 'What we think, we become.', author: 'Buddha' },
  { text: 'Well done is better than well said.', author: 'Benjamin Franklin' },
  { text: 'The journey of a thousand miles begins with a single step.', author: 'Lao Tzu' },
  { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Will Durant' },
  { text: 'You have power over your mind, not outside events. Realize this, and you will find strength.', author: 'Marcus Aurelius' },
  { text: 'The impediment to action advances action. What stands in the way becomes the way.', author: 'Marcus Aurelius' },
  { text: 'Simplicity is the ultimate sophistication.', author: 'Leonardo da Vinci' },
  { text: 'I have not failed. I have just found 10,000 ways that will not work.', author: 'Thomas Edison' },
  { text: 'Whether you think you can, or you think you can’t, you’re right.', author: 'Henry Ford' },
  { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt' },
  { text: 'Programs must be written for people to read, and only incidentally for machines to execute.', author: 'Harold Abelson' },
  { text: 'Premature optimization is the root of all evil.', author: 'Donald Knuth' },
  { text: 'Make it work, make it right, make it fast.', author: 'Kent Beck' },
  { text: 'Any fool can write code that a computer can understand. Good programmers write code that humans can understand.', author: 'Martin Fowler' },
  { text: 'First, solve the problem. Then, write the code.', author: 'John Johnson' },
  { text: 'The best way to predict the future is to invent it.', author: 'Alan Kay' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { text: 'Knowing yourself is the beginning of all wisdom.', author: 'Aristotle' },
  { text: 'The only true wisdom is in knowing you know nothing.', author: 'Socrates' },
  { text: 'Fall seven times, stand up eight.', author: 'Japanese proverb' },
  { text: 'Nothing is particularly hard if you divide it into small jobs.', author: 'Henry Ford' },
  { text: 'A reader lives a thousand lives before he dies. The man who never reads lives only one.', author: 'George R.R. Martin' },
  { text: 'Not all those who wander are lost.', author: 'J.R.R. Tolkien' },
  { text: 'It is not that we have a short time to live, but that we waste a lot of it.', author: 'Seneca' },
  { text: 'Quality is not an act, it is a habit.', author: 'Aristotle' },
  { text: 'Courage is not the absence of fear, but the triumph over it.', author: 'Nelson Mandela' }
];

const MAX_LENGTH = 200; // longer quotes don't fit a speech bubble

/**
 * Random quotes from people, books and more.
 *
 * No free quote API is truly unlimited (ZenQuotes allows 5 requests per 30 seconds), so this asks for
 * a batch of 50 at a time, keeps them in a pool, and refills in the background at most every few
 * minutes. If every online source fails, a built-in list keeps the quotes coming.
 *
 * Only the quote request itself is sent; nothing about the user or their project.
 */
export class QuoteService {
  private _pool: Quote[] = [];
  private _lastFetch = 0;
  private _fetching = false;
  private _recent: string[] = [];

  /** The next quote. Never waits on the network. */
  public next(online: boolean): Quote {
    if (online && this._pool.length < 5) void this._refill();
    let q = this._pool.shift();
    if (!q) q = this._offline();
    this._remember(q.text);
    return q;
  }

  private _offline(): Quote {
    const fresh = OFFLINE.filter(q => !this._recent.includes(q.text));
    const list = fresh.length ? fresh : OFFLINE;
    return list[Math.floor(Math.random() * list.length)];
  }

  private _remember(text: string): void {
    this._recent.push(text);
    if (this._recent.length > 15) this._recent.shift();
  }

  private async _refill(): Promise<void> {
    // At most one request at a time, and no more often than every 3 minutes (stays far under the rate limits).
    if (this._fetching || Date.now() - this._lastFetch < 3 * 60000) return;
    this._fetching = true;
    this._lastFetch = Date.now();
    try {
      const got = (await this._zenQuotes()) ?? (await this._dummyJson()) ?? [];
      const known = new Set([...this._pool.map(q => q.text), ...this._recent]);
      for (const q of got) if (!known.has(q.text)) this._pool.push(q);
    } finally {
      this._fetching = false;
    }
  }

  /** https://zenquotes.io (free, no key; 50 random quotes per call). Attribution: ZenQuotes.io */
  private async _zenQuotes(): Promise<Quote[] | undefined> {
    try {
      const res = await fetch('https://zenquotes.io/api/quotes', { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return undefined;
      const data = (await res.json()) as Array<{ q?: string; a?: string }>;
      const list = this._clean(data.map(d => ({ text: d.q ?? '', author: d.a ?? '' })));
      return list.length ? list : undefined;
    } catch {
      return undefined;
    }
  }

  /** https://dummyjson.com/quotes (free, no key). Used if ZenQuotes is unavailable. */
  private async _dummyJson(): Promise<Quote[] | undefined> {
    try {
      const skip = Math.floor(Math.random() * 1400);
      const res = await fetch(`https://dummyjson.com/quotes?limit=30&skip=${skip}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return undefined;
      const data = (await res.json()) as { quotes?: Array<{ quote?: string; author?: string }> };
      const list = this._clean((data.quotes ?? []).map(d => ({ text: d.quote ?? '', author: d.author ?? '' })));
      return list.length ? list : undefined;
    } catch {
      return undefined;
    }
  }

  private _clean(list: Quote[]): Quote[] {
    const out: Quote[] = [];
    for (const q of list) {
      const text = q.text.replace(/\s+/g, ' ').trim();
      const author = q.author.replace(/\s+/g, ' ').trim();
      // ZenQuotes answers with a placeholder "quote" when rate limited.
      if (!text || text.length > MAX_LENGTH || /too many requests/i.test(text)) continue;
      out.push({ text, author: author && !/^zenquotes/i.test(author) ? author : 'Unknown' });
    }
    // shuffle so batches don't arrive in the same order
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

export function formatQuote(q: Quote): string {
  return q.author && q.author !== 'Unknown' ? `“${q.text}” — ${q.author}` : `“${q.text}”`;
}
