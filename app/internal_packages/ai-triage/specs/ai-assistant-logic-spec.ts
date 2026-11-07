import { Contact, DateUtils, Message, SearchQueryParser, Thread } from 'mailspring-exports';
import {
  mailItem,
  periodStart,
  pickDay,
  toPills,
  toQuery,
  toSearch,
  todayString,
} from '../lib/assistant-logic';
import { TriageEntry } from '../lib/triage-logic';

const empty = {
  from: [],
  to: [],
  subject: [],
  words: [],
  since: '',
  before: '',
  unread: false,
  attachment: false,
};

describe('assistant-logic', function () {
  describe('toSearch', function () {
    it('drops backslashes and repeated values', function () {
      const s = toSearch({ from: ['Lena\\', 'Lena'], words: ['a\\b'], to: [], subject: [] });
      expect(s.from).toEqual(['Lena']);
      expect(s.words).toEqual(['ab']);
      expect(() => SearchQueryParser.parse(toQuery(s))).not.toThrow();
    });

    it('strips quotes, drops reserved words and caps the lists', function () {
      const s = toSearch({
        from: ['"Lena"', 'to', 'a', 'b', 'c'],
        words: ['OR', 'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7'],
        since: '2026-11-01',
        before: '2026-11',
        unread: true,
      });
      expect(s.from).toEqual(['Lena', 'a', 'b']);
      expect(s.words.length).toBe(6);
      expect(s.words[0]).toBe('w1');
      expect(s.since).toBe('2026-11-01');
      expect(s.before).toBe('');
      expect(s.unread).toBe(true);
      expect(s.attachment).toBe(false);
    });

    it('rejects anything but a plain object', function () {
      expect(toSearch(null)).toBe(null);
      expect(toSearch([1])).toBe(null);
      expect(toSearch('x')).toBe(null);
    });
  });

  describe('toQuery', function () {
    it('builds the query with an explicit midnight', function () {
      const query = toQuery({
        ...empty,
        from: ['Lena Park'],
        words: ['payout', 'payment'],
        since: '2026-11-01',
        unread: true,
      });
      expect(query).toBe(
        'from:"Lena Park" ("payout" OR "payment") since:"2026-11-01 00:00" is:unread'
      );
    });

    it('is empty without filters', function () {
      expect(toQuery(empty)).toBe('');
    });

    it('builds queries the search parser accepts', function () {
      const queries = [
        { ...empty, from: ['Lena', 'ledgerly.com'], words: ['payout'] },
        { ...empty, to: ['Sam'], subject: ['Budget'], attachment: true },
        { ...empty, words: ['a', 'b', 'c'], since: '2026-11-01', before: '2026-12-01' },
        { ...empty, from: ['x'], unread: true, since: '2026-01-01' },
      ].map(toQuery);
      for (const q of queries) {
        expect(() => SearchQueryParser.parse(`(${q}) NOT (in:trash OR in:spam)`)).not.toThrow();
      }
    });

    it('reads the midnight date as hour 0', function () {
      expect(DateUtils.getChronoPast().parseDate('2026-11-01 00:00').getHours()).toBe(0);
    });
  });

  describe('toPills', function () {
    it('lists the filters in a fixed order', function () {
      const pills = toPills({
        ...empty,
        from: ['Lena', 'Sam'],
        to: ['Kim'],
        subject: ['Budget'],
        words: ['payout'],
        unread: true,
        attachment: true,
      });
      expect(pills).toEqual([
        'From: Lena, Sam',
        'To: Kim',
        'Subject: Budget',
        'Words: payout',
        'Unread',
        'With attachments',
      ]);
    });

    it('adds the date range', function () {
      const pills = toPills({ ...empty, since: '2026-11-01', before: '2026-12-01' });
      expect(pills.length).toBe(2);
      expect(pills[0].startsWith('Since ')).toBe(true);
      expect(pills[1].startsWith('Before ')).toBe(true);
    });
  });

  describe('day period', function () {
    it('starts at 06:00 local time', function () {
      expect(periodStart(new Date(2026, 10, 7, 5, 59))).toBe(new Date(2026, 10, 6, 6, 0).getTime());
      expect(periodStart(new Date(2026, 10, 7, 6, 0))).toBe(new Date(2026, 10, 7, 6, 0).getTime());
    });

    it('formats today with zero padding', function () {
      expect(todayString(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
    });
  });

  describe('pickDay', function () {
    const now = new Date(2026, 10, 7, 12, 0).getTime();
    const hoursAgo = (h: number) => new Date(now - h * 3600_000);
    const thread = (id: string, over: Partial<Thread> = {}) =>
      new Thread({ id, unread: false, lastMessageReceivedTimestamp: hoursAgo(1), ...over });
    const lookup = (entries: { [id: string]: TriageEntry }) => (id: string) => entries[id];

    it('waits while a candidate has no entry', function () {
      expect(
        pickDay([thread('t1'), thread('t2')], lookup({ t1: { s: 0, a: 0.9 } }), 0.9, now)
      ).toBe(null);
    });

    it('counts spam, excludes it from needs and sorts by attention', function () {
      const pick = pickDay(
        [thread('t1'), thread('t2'), thread('t3'), thread('t4'), thread('t5')],
        lookup({
          t1: { s: 0.1, a: 0.76 },
          t2: { s: 0.95, a: 0.9 },
          t3: { s: 0.1, a: 0.8 },
          t4: { s: 0.1, a: 0.74 },
          t5: { f: 1 },
        }),
        0.9,
        now
      );
      expect(pick.spam).toBe(1);
      expect(pick.needs.map((t) => t.id)).toEqual(['t3', 't1']);
    });

    it('drops old read threads and keeps old unread ones', function () {
      const pick = pickDay(
        [
          thread('old-read', { lastMessageReceivedTimestamp: hoursAgo(48) }),
          thread('old-unread', { lastMessageReceivedTimestamp: hoursAgo(48), unread: true }),
        ],
        lookup({ 'old-unread': { s: 0, a: 0.9 } }),
        0.9,
        now
      );
      expect(pick.needs.map((t) => t.id)).toEqual(['old-unread']);
    });

    it('looks only at the first 200 threads', function () {
      const threads = Array.from({ length: 201 }, (_, i) => thread(`t${i}`));
      const entries: { [id: string]: TriageEntry } = {};
      threads.slice(0, 200).forEach((t) => (entries[t.id] = { s: 0, a: 0.9 }));
      expect(pickDay(threads, lookup(entries), 0.9, now).needs.length).toBe(200);
    });
  });

  describe('mailItem', function () {
    const t = new Thread({
      id: 't1',
      subject: 'Budget',
      lastMessageReceivedTimestamp: new Date('2026-11-06T09:41:00Z'),
    });

    it('marks my own messages and cuts the snippet to 400 characters', function () {
      const me = new Contact({ name: 'Me', email: 'me@x.io' });
      spyOn(me, 'isMe').andReturn(true);
      const m = new Message({
        from: [me],
        date: new Date('2026-11-06T10:00:00Z'),
        snippet: 'x'.repeat(500),
      });
      const item = mailItem(t, m);
      expect(item.from).toBe('Me <me@x.io> (me)');
      expect(item.snippet.length).toBe(400);
      expect(item.subject).toBe('Budget');
      expect(item.date).toBe('2026-11-06T10:00:00.000Z');
    });

    it('works without a message', function () {
      expect(mailItem(t)).toEqual({
        from: '',
        subject: 'Budget',
        date: '2026-11-06T09:41:00.000Z',
        snippet: '',
      });
    });
  });
});
