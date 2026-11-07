import { Contact, Message } from 'mailspring-exports';
import {
  buildThread,
  htmlToText,
  parseEntries,
  replaceReplyText,
  textToHtml,
  toDrafts,
  toSummary,
} from '../lib/reading-logic';

const me = { name: 'Me', email: 'me@example.com' };

let n = 0;
function msg(fields: Partial<Message> & { day?: number } = {}) {
  n += 1;
  return new Message({
    id: `m${n}`,
    body: `<p>Body ${n}</p>`,
    snippet: '',
    draft: false,
    date: new Date(Date.UTC(2026, 10, fields.day || n, 9, 0, 0)),
    from: [new Contact({ name: 'Lena', email: 'lena@x.io' })],
    ...fields,
  });
}

describe('reading-logic', function () {
  describe('htmlToText', function () {
    it('puts paragraphs on their own lines', function () {
      expect(htmlToText('<p>Hi,</p><p>No problem</p>')).toBe('Hi,\nNo problem');
    });
    it('turns br into a line break', function () {
      expect(htmlToText('a<br>b')).toBe('a\nb');
    });
    it('removes style and script', function () {
      expect(htmlToText('<style>p{color:red}</style><script>x()</script><p>Hi</p>')).toBe('Hi');
    });
  });

  describe('buildThread', function () {
    it('drops drafts', function () {
      const out = buildThread('S', [msg(), msg({ draft: true })], me);
      expect(out.messages.length).toBe(1);
    });

    it('keeps the newest 8 of 10 messages in date order', function () {
      const messages = Array.from({ length: 10 }, (_, i) => msg({ day: i + 1 }));
      const out = buildThread('S', messages, me);
      expect(out.messages.length).toBe(8);
      expect(out.messages[0].date).toBe(messages[2].date.toISOString());
      expect(out.messages[7].date).toBe(messages[9].date.toISOString());
    });

    it('cuts a long body to 3000 characters', function () {
      const out = buildThread('S', [msg({ body: `<p>${'x'.repeat(5000)}</p>` })], me);
      expect(out.messages[0].text.length).toBe(3000);
    });

    it('keeps the newest message when the total passes 12000', function () {
      const big = () => msg({ body: `<p>${'x'.repeat(5000)}</p>` });
      const messages = [big(), big(), big(), big(), big(), msg({ body: '<p>newest</p>' })];
      const out = buildThread('S', messages, me);
      expect(out.messages[out.messages.length - 1].text).toBe('newest');
      expect(out.messages.length).toBeLessThan(6);
    });

    it('removes quoted text', function () {
      const body = '<p>New</p><blockquote class="gmail_quote"><p>Old</p></blockquote>';
      expect(buildThread('S', [msg({ body })], me).messages[0].text).toBe('New');
    });

    it('drops quoted lines of a plaintext message', function () {
      const out = buildThread('S', [msg({ plaintext: true, body: 'New\n> Old\nMore' })], me);
      expect(out.messages[0].text).toBe('New\nMore');
    });

    it('uses the snippet for an empty body', function () {
      const out = buildThread('S', [msg({ body: '', snippet: 'Snippet' })], me);
      expect(out.messages[0].text).toBe('Snippet');
    });

    it('formats the sender and the date', function () {
      const out = buildThread('Subject', [msg({ day: 6 })], me);
      expect(out.subject).toBe('Subject');
      expect(out.me).toEqual(me);
      expect(out.messages[0].from).toBe('Lena <lena@x.io>');
      expect(out.messages[0].date).toBe('2026-11-06T09:00:00.000Z');
    });
  });

  describe('textToHtml', function () {
    it('escapes html and turns line breaks into br', function () {
      expect(textToHtml('a < b & c\nd')).toBe('a &lt; b &amp; c<br/>d');
    });
  });

  describe('replaceReplyText', function () {
    const quote =
      '<div class="gmail_quote_attribution">Lena wrote:</div><blockquote class="gmail_quote">Q</blockquote>';
    const signature = '<signature id="s1">Sig</signature>';

    it('keeps the signature and the quote', function () {
      const out = replaceReplyText(`old<br/>${signature}${quote}`, 'new');
      expect(out).toBe(`new<br/><br/>${signature}${quote}`);
    });
    it('keeps the quote when there is no signature', function () {
      expect(replaceReplyText(`old<br/><br/>${quote}`, 'new')).toBe(`new<br/><br/>${quote}`);
    });
    it('returns only the new html when there is neither', function () {
      expect(replaceReplyText('old', 'new')).toBe('new');
    });
  });

  describe('toSummary', function () {
    const valid = { points: ['a'], actions: [{ text: 'do', due: 'Fri' }], replies: ['ok'] };
    it('accepts a valid summary', function () {
      expect(toSummary(valid)).toEqual(valid);
    });
    it('rejects invalid summaries', function () {
      expect(toSummary(null)).toBeNull();
      expect(toSummary({ ...valid, points: [] })).toBeNull();
      expect(toSummary({ ...valid, points: 'a' })).toBeNull();
      expect(toSummary({ ...valid, actions: [{ text: 'x' }] })).toBeNull();
      expect(toSummary({ ...valid, replies: [1] })).toBeNull();
    });
  });

  describe('toDrafts', function () {
    it('accepts three non-empty strings', function () {
      const d = { default: 'a', shorter: 'b', formal: 'c' };
      expect(toDrafts(d)).toEqual(d);
    });
    it('rejects a missing or empty tone', function () {
      expect(toDrafts({ default: 'a', shorter: 'b' })).toBeNull();
      expect(toDrafts({ default: 'a', shorter: 'b', formal: ' ' })).toBeNull();
    });
  });

  describe('parseEntries', function () {
    const summary = { k: 'm1', n: 2, points: ['a'], actions: [], replies: [] };
    it('returns an empty map for a wrong version', function () {
      expect(parseEntries({ v: 2, entries: { t1: summary } }).size).toBe(0);
    });
    it('keeps valid entries and drops junk', function () {
      const out = parseEntries({
        v: 1,
        entries: {
          t1: summary,
          t2: { k: 'm2', f: 1 },
          t3: { k: 'm3' },
          t4: 'x',
          t5: { ...summary, points: [] },
        },
      });
      expect([...out.keys()]).toEqual(['t1', 't2']);
      expect(out.get('t2')).toEqual({ k: 'm2', f: 1 });
    });
    it('keeps the done list', function () {
      const out = parseEntries({ v: 1, entries: { t1: { ...summary, d: [0] } } });
      expect((out.get('t1') as { d: number[] }).d).toEqual([0]);
    });
  });
});
