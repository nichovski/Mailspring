import { DOMUtils, Message, QuotedHTMLTransformer, RegExpUtils } from 'mailspring-exports';

export const MAX_MESSAGES = 8;
export const MAX_MESSAGE_CHARS = 3000;
export const MAX_TOTAL_CHARS = 12000;

export interface Summary {
  points: string[];
  actions: { text: string; due: string }[];
  replies: string[];
}
export interface Drafts {
  default: string;
  shorter: string;
  formal: string;
}
export type Tone = 'default' | 'shorter' | 'formal';

export interface ThreadPayload {
  me: { name: string; email: string };
  subject: string;
  messages: { from: string; date: string; text: string }[];
}

/** `k` is the id of the last non-draft message the entry was made for; `d` lists done action indexes. */
export type ReadingEntry = (Summary & { k: string; n: number; d?: number[] }) | { k: string; f: 1 };

export const lastMessage = (messages: Message[]): Message | undefined =>
  messages.filter((m) => !m.draft).pop();

export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style, script').forEach((el) => el.remove());
  doc.querySelectorAll('br').forEach((el) => el.replaceWith('\n'));
  doc.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6').forEach((el) => el.append('\n'));
  return (doc.body.textContent || '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The new text of a message: quoted text is dropped, and the snippet stands in for an empty body. */
export function messageText(m: Message): string {
  const text = m.plaintext
    ? (m.body || '')
        .split('\n')
        .filter((line) => !line.startsWith('>'))
        .join('\n')
        .trim()
    : htmlToText(QuotedHTMLTransformer.removeQuotedHTML(m.body || ''));
  return (text || m.snippet || '').slice(0, MAX_MESSAGE_CHARS);
}

/** The newest messages that fit the size caps, always including the newest, in date order. */
export function buildThread(
  subject: string,
  messages: Message[],
  me: { name: string; email: string }
): ThreadPayload {
  const picked: ThreadPayload['messages'] = [];
  let total = 0;
  const newestFirst = messages.filter((m) => !m.draft).reverse();
  for (const m of newestFirst) {
    if (picked.length >= MAX_MESSAGES || (picked.length > 0 && total >= MAX_TOTAL_CHARS)) {
      break;
    }
    const text = messageText(m);
    const c = m.from[0];
    total += text.length;
    picked.push({
      from: `${(c && c.name) || ''} <${(c && c.email) || ''}>`.trim(),
      date: m.date.toISOString(),
      text,
    });
  }
  return { me, subject, messages: picked.reverse() };
}

export const textToHtml = (text: string) =>
  text.trim().split('\n').map(DOMUtils.escapeHTMLCharacters).join('<br/>');

/** Swaps the text above the signature and the quote of a reply body for `html`. */
export function replaceReplyText(body: string, html: string): string {
  const cuts = [
    body.search(/<signature[\s>]/i),
    body.search(RegExpUtils.nativeQuoteStartRegex()),
  ].filter((i) => i >= 0);
  return cuts.length ? `${html}<br/><br/>${body.slice(Math.min(...cuts))}` : html;
}

const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === 'string');

export function toSummary(json: unknown): Summary | null {
  const { points, actions, replies } = (json || {}) as Partial<Summary>;
  const actionsOk =
    Array.isArray(actions) &&
    actions.every((a) => a && typeof a.text === 'string' && typeof a.due === 'string');
  if (!isStrings(points) || points.length === 0 || !actionsOk || !isStrings(replies)) {
    return null;
  }
  return {
    points,
    actions: actions.map((a) => ({ text: a.text, due: a.due })),
    replies,
  };
}

export function toDrafts(json: unknown): Drafts | null {
  const d = (json || {}) as Partial<Drafts>;
  const ok = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;
  return ok(d.default) && ok(d.shorter) && ok(d.formal)
    ? { default: d.default, shorter: d.shorter, formal: d.formal }
    : null;
}

/** Reads the saved file, or returns an empty map when it is missing or malformed. */
export function parseEntries(json: unknown): Map<string, ReadingEntry> {
  const out = new Map<string, ReadingEntry>();
  const { v, entries } = (json || {}) as { v?: number; entries?: Record<string, unknown> };
  if (v !== 1 || !entries || typeof entries !== 'object') {
    return out;
  }
  for (const [id, raw] of Object.entries(entries)) {
    const e = (raw || {}) as { k?: unknown; f?: unknown; n?: unknown; d?: unknown };
    if (typeof e.k !== 'string') continue;
    if (e.f === 1) {
      out.set(id, { k: e.k, f: 1 });
      continue;
    }
    const summary = toSummary(raw);
    if (summary && typeof e.n === 'number') {
      const done = Array.isArray(e.d) && e.d.every((i) => typeof i === 'number');
      out.set(id, { k: e.k, n: e.n, ...summary, ...(done ? { d: e.d as number[] } : {}) });
    }
  }
  return out;
}
