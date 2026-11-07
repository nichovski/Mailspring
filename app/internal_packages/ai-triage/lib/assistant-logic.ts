import { DatabaseStore, localized, Message, Thread } from 'mailspring-exports';
import { messageText } from './reading-logic';
import { effectiveSpam, isScore, TriageEntry, TriageScore } from './triage-logic';
import { WINDOW } from './triage-scorer';

export const MAX_THREADS = 8;
const MAX_SNIPPET = 400;
export const ASK_MAX_THREADS = 40;
const ASK_MAX_MESSAGES = 6;
const ASK_MESSAGE_CHARS = 2000;
// Even at 2 bytes per character this stays under nginx's 256k body limit.
const ASK_TOTAL_CHARS = 100_000;
const DAY_MS = 24 * 3600_000;
// The meter's High level. Medium and up counted most recent mail as needing the user, which made
// the brief's count meaningless (126 vs 16 on a real 22-account inbox).
export const NEEDS_ATTENTION = 0.75;

export interface MailItem {
  from: string;
  subject: string;
  date: string;
  snippet: string;
}
export interface AskSearch {
  from: string[];
  to: string[];
  subject: string[];
  words: string[];
  since: string;
  before: string;
  unread: boolean;
  attachment: boolean;
}
export interface AskConversation {
  subject: string;
  messages: { from: string; date: string; text: string }[];
}
export interface AskAnswer {
  answer: string;
  sources: number[];
}
export interface DayBrief {
  t: number;
  brief: string;
}

// A quoted value equal to one of these is still read as a keyword, and the parse throws.
const RESERVED = new Set([
  'and',
  'or',
  'not',
  'to',
  'from',
  'subject',
  'in',
  'is',
  'has',
  'since',
  'after',
  'before',
]);

const clean = (v: unknown, max: number) =>
  (Array.isArray(v) ? v : [])
    .filter((s): s is string => typeof s === 'string')
    // A backslash before the closing quote would escape it and leave the phrase open.
    .map((s) => s.replace(/["\\]/g, '').trim())
    .filter((s, i, all) => s && !RESERVED.has(s.toLowerCase()) && all.indexOf(s) === i)
    .slice(0, max);

const isoDay = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

/** Reads the search filters from the backend response, or null when it is not an object. */
export function toSearch(json: unknown): AskSearch | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return null;
  }
  const j = json as Record<string, unknown>;
  return {
    from: clean(j.from, 3),
    to: clean(j.to, 3),
    subject: clean(j.subject, 3),
    words: clean(j.words, 6),
    since: isoDay(j.since),
    before: isoDay(j.before),
    unread: j.unread === true,
    attachment: j.attachment === true,
  };
}

const anyOf = (field: string, values: string[]) => {
  const terms = values.map((v) => `${field}"${v}"`);
  return terms.length > 1 ? `(${terms.join(' OR ')})` : terms[0] || '';
};

/**
 * The fallback for a search that found nothing: keeps the people and the dates and drops the
 * subject and words, so the model can find the topic in that person's mail. Null when there are
 * no people to keep or nothing to drop.
 */
export function broaden(s: AskSearch): AskSearch | null {
  if (!(s.from.length || s.to.length) || !(s.subject.length || s.words.length)) {
    return null;
  }
  return { ...s, subject: [], words: [] };
}

/** chrono reads a bare date as 12:00, so ranges carry an explicit midnight. */
export function toQuery(s: AskSearch): string {
  return [
    anyOf('from:', s.from),
    anyOf('to:', s.to),
    anyOf('subject:', s.subject),
    anyOf('', s.words),
    s.since && `since:"${s.since} 00:00"`,
    s.before && `before:"${s.before} 00:00"`,
    s.unread && 'is:unread',
    s.attachment && 'has:attachment',
  ]
    .filter(Boolean)
    .join(' ');
}

const dayLabel = (d: string) => {
  const date = new Date(`${d}T00:00:00`);
  const year = date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year });
};

export function toPills(s: AskSearch): string[] {
  const list = (label: string, values: string[]) =>
    values.length ? [`${label}: ${values.join(', ')}`] : [];
  return [
    ...list(localized('From'), s.from),
    ...list(localized('To'), s.to),
    ...list(localized('Subject'), s.subject),
    ...list(localized('Words'), s.words),
    ...(s.since ? [localized('Since %@', dayLabel(s.since))] : []),
    ...(s.before ? [localized('Before %@', dayLabel(s.before))] : []),
    ...(s.unread ? [localized('Unread')] : []),
    ...(s.attachment ? [localized('With attachments')] : []),
  ];
}

const nonEmpty = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
export function toAnswer(json: unknown): AskAnswer | null {
  const { answer, sources } = (json || {}) as { answer?: unknown; sources?: unknown };
  const text = nonEmpty(answer);
  if (!text) {
    return null;
  }
  const numbers = (Array.isArray(sources) ? sources : []).filter(
    (n, i, all): n is number => Number.isInteger(n) && all.indexOf(n) === i
  );
  return { answer: text, sources: numbers };
}
export const toBrief = (json: unknown) => nonEmpty((json as { brief?: unknown })?.brief);

export function parseDayFile(json: unknown): DayBrief | null {
  const { v, t, brief } = (json || {}) as { v?: unknown; t?: unknown; brief?: unknown };
  return v === 1 && typeof t === 'number' && nonEmpty(brief) ? { t, brief: brief as string } : null;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const todayString = (now: Date) =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

/** Briefs are made once per day; a day starts at 06:00 local time. */
export function periodStart(now: Date): number {
  const d = new Date(now);
  d.setHours(6, 0, 0, 0);
  if (d > now) {
    d.setDate(d.getDate() - 1);
  }
  return d.getTime();
}

/** null while a candidate still waits for a score. Candidates are unread or under a day old, within the scorer's window. */
export function pickDay(
  threads: Thread[],
  entryFor: (id: string) => TriageEntry | undefined,
  threshold: number,
  now: number
) {
  const recent = threads
    .slice(0, WINDOW)
    .filter((t) => t.unread || now - t.lastMessageReceivedTimestamp.getTime() < DAY_MS);
  if (recent.some((t) => !entryFor(t.id))) {
    return null;
  }
  const spam = recent.filter((t) => effectiveSpam(entryFor(t.id)) >= threshold).length;
  const attention = (t: Thread) => (entryFor(t.id) as TriageScore).a;
  const needs = recent
    .filter((t) => {
      const e = entryFor(t.id);
      return isScore(e) && effectiveSpam(e) < threshold && e.a >= NEEDS_ATTENTION;
    })
    .sort((a, b) => attention(b) - attention(a));
  return { needs, spam };
}

const sender = (m?: Message) => {
  const c = m && m.from[0];
  return c
    ? `${c.name || ''} <${c.email || ''}>${c.isMe() ? ' (me)' : ''}`.trim().slice(0, 500)
    : '';
};

export function mailItem(thread: Thread, last?: Message): MailItem {
  return {
    from: sender(last),
    subject: thread.subject || '',
    date: (last ? last.date : thread.lastMessageReceivedTimestamp).toISOString(),
    snippet: ((last && last.snippet) || '').slice(0, MAX_SNIPPET),
  };
}

/** The last non-draft message of each thread, without bodies: only the 400-char snippet leaves the device. */
export async function mailItems(threads: Thread[]): Promise<MailItem[]> {
  const messages = await DatabaseStore.findAll<Message>(Message).where({
    threadId: threads.map((t) => t.id),
  });
  return threads.map((t) =>
    mailItem(
      t,
      messages
        .filter((m) => m.threadId === t.id && !m.draft)
        .sort((a, b) => +a.date - +b.date)
        .pop()
    )
  );
}

/** The messages Ask reads from a thread: its latest non-drafts, in date order. */
export const askPick = (thread: Thread, messages: Message[]) =>
  messages
    .filter((m) => m.threadId === thread.id && !m.draft)
    .sort((a, b) => +a.date - +b.date)
    .slice(-ASK_MAX_MESSAGES);

/**
 * The Ask payload: matching threads newest first, each with the new text of its latest messages in
 * date order. It stops at the text budget, so `threads` (aligned with `conversations`, for the
 * answer's source numbers) can be shorter than the input.
 */
export function askConversations(
  threads: Thread[],
  messages: Message[]
): { threads: Thread[]; conversations: AskConversation[] } {
  const used: Thread[] = [];
  const conversations: AskConversation[] = [];
  let total = 0;
  for (const thread of threads) {
    const picked = askPick(thread, messages)
      .map((m) => ({
        from: sender(m),
        date: m.date.toISOString(),
        text: messageText(m).slice(0, ASK_MESSAGE_CHARS),
      }))
      .filter((m) => m.text);
    if (!picked.length) {
      continue;
    }
    const subject = (thread.subject || '').slice(0, 1000);
    const size = picked.reduce((n, m) => n + m.text.length + m.from.length, subject.length);
    if (used.length && total + size > ASK_TOTAL_CHARS) {
      break;
    }
    total += size;
    used.push(thread);
    conversations.push({ subject, messages: picked });
  }
  return { threads: used, conversations };
}
