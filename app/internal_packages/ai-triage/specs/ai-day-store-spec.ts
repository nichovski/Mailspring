import { MailspringAPIRequest, Thread } from 'mailspring-exports';
import DayStore from '../lib/day-store';
import TriageStore from '../lib/triage-store';

async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

const item = { from: 'Lena <lena@x.io>', subject: 'S', date: '2026-11-06T09:41:00Z', snippet: 'x' };

describe('DayStore', function () {
  const at = (d: number, h: number) => new Date(2026, 10, d, h, 0);
  let threads: Thread[];
  let request: jasmine.Spy;
  let save: jasmine.Spy;
  let entry: jasmine.Spy;

  beforeEach(function () {
    const now = at(7, 9);
    threads = ['t1', 't2', 't3'].map(
      (id) => new Thread({ id, unread: true, lastMessageReceivedTimestamp: now })
    );
    DayStore._brief = null;
    DayStore._tried = 0;
    DayStore._loading = false;
    DayStore._quiet = false;
    spyOn(DayStore, '_inbox').andCallFake(() => Promise.resolve(threads));
    spyOn(DayStore, '_items').andReturn(Promise.resolve([item]));
    save = spyOn(DayStore, '_save');
    request = spyOn(MailspringAPIRequest, 'makeRequest').andReturn(
      Promise.resolve({ brief: 'Two need you.' })
    );
    spyOn(TriageStore, 'threshold').andReturn(0.9);
    entry = spyOn(TriageStore, 'entry').andCallFake(
      (id: string) =>
        ({ t1: { s: 0.1, a: 0.8 }, t2: { s: 0.95, a: 0.9 }, t3: { s: 0.1, a: 0.76 } })[id]
    );
  });

  it('asks once for a stale brief, with the counts, and saves it', async function () {
    await DayStore.refresh(at(7, 9));
    await settle();
    expect(request.callCount).toBe(1);
    const { path, body } = request.mostRecentCall.args[0];
    expect(path).toBe('/api/ai/day');
    expect(body.needs).toBe(2);
    expect(body.spam).toBe(1);
    expect(body.today).toBe('2026-11-07');
    expect(save).toHaveBeenCalled();
    expect(DayStore.current(at(7, 10)).brief).toBe('Two need you.');
  });

  it('makes no call while a brief of this period exists', async function () {
    DayStore._brief = { t: at(7, 8).getTime(), brief: 'Done.' };
    await DayStore.refresh(at(7, 9));
    expect(request).not.toHaveBeenCalled();
  });

  it('waits for a candidate without a score', async function () {
    entry.andCallFake((id: string) => (id === 't1' ? { s: 0.1, a: 0.8 } : undefined));
    await DayStore.refresh(at(7, 9));
    expect(request).not.toHaveBeenCalled();
  });

  it('makes no call and goes quiet when nothing needs you', async function () {
    entry.andReturn({ s: 0.1, a: 0.1 });
    await DayStore.refresh(at(7, 9));
    expect(request).not.toHaveBeenCalled();
    expect(DayStore.quiet()).toBe(true);
  });

  it('does not retry a failure in the same period', async function () {
    request.andReturn(Promise.reject({ statusCode: 502 }));
    await DayStore.refresh(at(7, 9));
    await settle();
    await DayStore.refresh(at(7, 10));
    expect(request.callCount).toBe(1);
  });

  it('asks again in the next period', async function () {
    await DayStore.refresh(at(7, 9));
    await settle();
    await DayStore.refresh(at(8, 7));
    await settle();
    expect(request.callCount).toBe(2);
  });
});
