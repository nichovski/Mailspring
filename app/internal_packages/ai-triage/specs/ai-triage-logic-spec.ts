import {
  toScore,
  meterLevel,
  spamFlag,
  orderThreads,
  buildState,
  parseScores,
  TriageEntry,
} from '../lib/triage-logic';

const threads = ['t1', 't2', 't3', 't4', 't5'].map((id) => ({ id }));

function lookup(entries: { [id: string]: TriageEntry }) {
  return (id: string) => entries[id];
}

describe('ai-triage logic', function () {
  describe('toScore', function () {
    it('keeps values in range', function () {
      expect(toScore({ spam: 0.97, attention: 0.28 })).toEqual({ s: 0.97, a: 0.28 });
    });

    it('clamps values outside 0..1', function () {
      expect(toScore({ spam: 1.4, attention: -2 })).toEqual({ s: 1, a: 0 });
    });

    it('rejects invalid input', function () {
      expect(toScore(null)).toBe(null);
      expect(toScore({ spam: 0.5 })).toBe(null);
      expect(toScore({ spam: '0.5', attention: 0.5 })).toBe(null);
      expect(toScore({ spam: NaN, attention: 0.5 })).toBe(null);
    });
  });

  describe('meterLevel', function () {
    it('changes level at 0.75, 0.4 and 0.15', function () {
      expect(meterLevel(0.75)).toEqual({ level: 'High', bars: 4 });
      expect(meterLevel(0.74)).toEqual({ level: 'Medium', bars: 3 });
      expect(meterLevel(0.4)).toEqual({ level: 'Medium', bars: 3 });
      expect(meterLevel(0.39)).toEqual({ level: 'Low', bars: 2 });
      expect(meterLevel(0.15)).toEqual({ level: 'Low', bars: 2 });
      expect(meterLevel(0.14)).toEqual({ level: 'Very low', bars: 1 });
    });
  });

  describe('spamFlag', function () {
    it('shows nothing below 0.4', function () {
      expect(spamFlag({ s: 0.39, a: 0.5 }, 0.9)).toBe(null);
    });

    it('says maybe from 0.4 up to the threshold', function () {
      expect(spamFlag({ s: 0.4, a: 0.5 }, 0.9)).toEqual({ kind: 'maybe', percent: 40 });
      expect(spamFlag({ s: 0.89, a: 0.5 }, 0.9)).toEqual({ kind: 'maybe', percent: 89 });
    });

    it('says spam at the threshold and above', function () {
      expect(spamFlag({ s: 0.9, a: 0.5 }, 0.9)).toEqual({ kind: 'spam', percent: 90 });
    });

    it('shows nothing after the user marked the thread Not spam', function () {
      expect(spamFlag({ s: 0.97, a: 0.5, o: 'ham' }, 0.9)).toBe(null);
    });

    it('shows nothing for a failed or missing score', function () {
      expect(spamFlag({ f: 1 }, 0.9)).toBe(null);
      expect(spamFlag(undefined, 0.9)).toBe(null);
    });
  });

  describe('orderThreads', function () {
    const entries = {
      t1: { s: 0.1, a: 0.2 },
      t2: { s: 0.1, a: 0.9 },
      t3: { s: 0.95, a: 0.99 },
      t4: { f: 1 as const },
      t5: { s: 0.2, a: 0.9 },
    };

    it('priority sorts by attention, then date, and puts unscored threads last', function () {
      const ids = orderThreads(threads, lookup(entries), 0.9, 'priority').map((t) => t.id);
      expect(ids).toEqual(['t2', 't5', 't1', 't4']);
    });

    it('priority leaves out spam above the threshold', function () {
      const ids = orderThreads(threads, lookup(entries), 0.9, 'priority').map((t) => t.id);
      expect(ids).not.toContain('t3');
    });

    it('spam lists only threads at or above the threshold', function () {
      const ids = orderThreads(threads, lookup(entries), 0.9, 'spam').map((t) => t.id);
      expect(ids).toEqual(['t3']);
    });

    it('moving the threshold moves threads between the views', function () {
      expect(orderThreads(threads, lookup(entries), 0.99, 'spam')).toEqual([]);
      const ids = orderThreads(threads, lookup(entries), 0.99, 'priority').map((t) => t.id);
      expect(ids[0]).toBe('t3');
      const spam = orderThreads(threads, lookup(entries), 0.15, 'spam').map((t) => t.id);
      expect(spam).toEqual(['t3', 't5']);
    });

    it('moves a Not spam thread out of the spam view', function () {
      const marked = { ...entries, t3: { s: 0.95, a: 0.99, o: 'ham' as const } };
      expect(orderThreads(threads, lookup(marked), 0.9, 'spam')).toEqual([]);
    });
  });

  describe('buildState', function () {
    it('joins sender, subject and body, and caps the length', function () {
      const text = buildState({ name: 'Ann', email: 'a@x.co' }, 'Hi', 'Body');
      expect(text).toBe('From: Ann <a@x.co>\nSubject: Hi\n\nBody');
      expect(buildState(undefined, 'Hi', 'x'.repeat(9000)).length).toBe(4000);
    });
  });

  describe('parseScores', function () {
    it('reads a saved file and drops bad entries', function () {
      const map = parseScores({
        v: 1,
        scores: { a: { s: 0.5, a: 0.5, o: 'ham' }, b: { f: 1 }, c: { s: 'x' } },
      });
      expect([...map.keys()]).toEqual(['a', 'b']);
      expect(map.get('a')).toEqual({ s: 0.5, a: 0.5, o: 'ham' });
    });

    it('returns an empty map for a wrong version or garbage', function () {
      expect(parseScores({ v: 2, scores: {} }).size).toBe(0);
      expect(parseScores(null).size).toBe(0);
    });
  });
});
