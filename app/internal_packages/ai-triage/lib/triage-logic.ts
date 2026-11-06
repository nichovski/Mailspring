export interface TriageScore {
  s: number; // spam probability, 0..1
  a: number; // attention, 0..1
  o?: 'ham'; // the user marked this thread "Not spam"
}
export interface TriageFailure {
  f: 1; // scoring failed for good; never requested again
}
export type TriageEntry = TriageScore | TriageFailure;

export type MeterLevel = 'High' | 'Medium' | 'Low' | 'Very low';
export type SpamFlag = { kind: 'spam' | 'maybe'; percent: number };

/** Below this a spam score is not shown to the user. */
export const MAYBE_SPAM = 0.4;
const MAX_TEXT = 4000;

export function isScore(entry: TriageEntry | undefined): entry is TriageScore {
  return !!entry && 's' in entry;
}

/** Reads the backend response, or returns null when it is not a pair of 0..1 numbers. */
export function toScore(json: unknown): TriageScore | null {
  const { spam, attention } = (json || {}) as { spam?: unknown; attention?: unknown };
  const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  if (!valid(spam) || !valid(attention)) {
    return null;
  }
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return { s: clamp(spam), a: clamp(attention) };
}

export function effectiveSpam(entry: TriageEntry | undefined): number {
  return isScore(entry) && entry.o !== 'ham' ? entry.s : 0;
}

export function meterLevel(attention: number): { level: MeterLevel; bars: number } {
  if (attention >= 0.75) return { level: 'High', bars: 4 };
  if (attention >= 0.4) return { level: 'Medium', bars: 3 };
  if (attention >= 0.15) return { level: 'Low', bars: 2 };
  return { level: 'Very low', bars: 1 };
}

/** The chip in the thread list and the warning bar in the message view share these rules. */
export function spamFlag(entry: TriageEntry | undefined, threshold: number): SpamFlag | null {
  const spam = effectiveSpam(entry);
  if (spam < MAYBE_SPAM) {
    return null;
  }
  return { kind: spam >= threshold ? 'spam' : 'maybe', percent: Math.round(spam * 100) };
}

/**
 * Priority: not-spam threads by attention, then threads with no score yet (so no mail is
 * hidden while scoring catches up). Spam: threads at or above the threshold, most likely first.
 * Input arrives newest first and the sort is stable, so ties stay in date order.
 */
export function orderThreads<T extends { id: string }>(
  threads: T[],
  entryFor: (id: string) => TriageEntry | undefined,
  threshold: number,
  mode: 'priority' | 'spam'
): T[] {
  const spamOf = (t: T) => effectiveSpam(entryFor(t.id));
  if (mode === 'spam') {
    return threads.filter((t) => spamOf(t) >= threshold).sort((a, b) => spamOf(b) - spamOf(a));
  }
  const scored: T[] = [];
  const unscored: T[] = [];
  for (const t of threads) {
    const entry = entryFor(t.id);
    if (spamOf(t) >= threshold) continue;
    (isScore(entry) ? scored : unscored).push(t);
  }
  const attentionOf = (t: T) => (entryFor(t.id) as TriageScore).a;
  return scored.sort((a, b) => attentionOf(b) - attentionOf(a)).concat(unscored);
}

/** The text sent for scoring: sender, subject and the start of the body. */
export function buildState(
  from: { name?: string; email?: string } | undefined,
  subject: string,
  body: string
): string {
  const sender = from ? `${from.name || ''} <${from.email || ''}>`.trim() : '';
  return `From: ${sender}\nSubject: ${subject || ''}\n\n${body}`.slice(0, MAX_TEXT);
}

/** Reads the saved scores file, or returns an empty map when it is missing or malformed. */
export function parseScores(json: unknown): Map<string, TriageEntry> {
  const out = new Map<string, TriageEntry>();
  const { v, scores } = (json || {}) as { v?: number; scores?: Record<string, unknown> };
  if (v !== 1 || !scores || typeof scores !== 'object') {
    return out;
  }
  for (const [id, raw] of Object.entries(scores)) {
    const entry = raw as Partial<TriageScore & TriageFailure>;
    if (entry && entry.f === 1) {
      out.set(id, { f: 1 });
    } else if (entry && typeof entry.s === 'number' && typeof entry.a === 'number') {
      out.set(
        id,
        entry.o === 'ham' ? { s: entry.s, a: entry.a, o: 'ham' } : { s: entry.s, a: entry.a }
      );
    }
  }
  return out;
}
