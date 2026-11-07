import {
  AccountStore,
  Contact,
  Message,
  MailspringAPIRequest,
  MessageStore,
  Thread,
} from 'mailspring-exports';
import ReadingStore from '../lib/reading-store';
import TriageStore from '../lib/triage-store';

async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

const summary = { points: ['p'], actions: [], replies: ['ok'] };
const drafts = { default: 'a', shorter: 'b', formal: 'c' };

describe('ReadingStore', function () {
  let thread: Thread;
  let lastId: string;
  let current: Thread;
  let request: jasmine.Spy;

  const items = () => [
    new Message({
      id: lastId,
      body: '<p>Hello</p>',
      date: new Date(),
      from: [new Contact({ name: 'Lena', email: 'lena@x.io' })],
    }),
  ];

  beforeEach(function () {
    thread = new Thread({ id: 't1', accountId: 'a1', subject: 'S' });
    current = thread;
    lastId = 'm1';
    ReadingStore._entries = new Map();
    ReadingStore._inFlight.clear();
    ReadingStore._failed.clear();
    ReadingStore._aiDrafts.clear();
    ReadingStore._halted = false;
    ReadingStore._pendingKey = null;
    spyOn(ReadingStore, '_save');
    spyOn(MessageStore, 'thread').andCallFake(() => current);
    spyOn(MessageStore, 'threadId').andCallFake(() => current.id);
    spyOn(MessageStore, 'items').andCallFake(items);
    spyOn(MessageStore, 'itemsLoading').andReturn(false);
    spyOn(AccountStore, 'accountForId').andReturn({ name: 'Me', emailAddress: 'me@example.com' });
    spyOn(ReadingStore, 'enabled').andReturn(true);
    spyOn(TriageStore, 'enabled').andReturn(false);
    request = spyOn(MailspringAPIRequest, 'makeRequest').andReturn(Promise.resolve(summary));
  });

  afterEach(function () {
    ReadingStore._clearTimer();
  });

  it('makes no request before the thread has stayed focused for 1000 ms', function () {
    ReadingStore._onMessages();
    advanceClock(999);
    expect(request).not.toHaveBeenCalled();
    advanceClock(1);
    expect(request.callCount).toBe(1);
    expect(request.mostRecentCall.args[0].path).toBe('/api/ai/summary');
  });

  it('asks only for the thread focused last', function () {
    ReadingStore._onMessages();
    advanceClock(500);
    current = new Thread({ id: 't2', accountId: 'a1', subject: 'S2' });
    ReadingStore._onMessages();
    advanceClock(1000);
    expect(request.callCount).toBe(1);
    expect(request.mostRecentCall.args[0].body.subject).toBe('S2');
  });

  it('does not ask again for a cached last message', function () {
    ReadingStore._entries.set('t1', { k: 'm1', n: 1, ...summary });
    ReadingStore._onMessages();
    advanceClock(1000);
    expect(request).not.toHaveBeenCalled();
  });

  it('asks again when the last message changes', function () {
    ReadingStore._entries.set('t1', { k: 'm1', n: 1, ...summary });
    lastId = 'm2';
    ReadingStore._onMessages();
    advanceClock(1000);
    expect(request.callCount).toBe(1);
  });

  it('does not postpone the request when the same key repeats', function () {
    ReadingStore._onMessages();
    advanceClock(600);
    ReadingStore._onMessages();
    advanceClock(400);
    expect(request.callCount).toBe(1);
  });

  it('makes no request while the setting is off', function () {
    (ReadingStore.enabled as jasmine.Spy).andReturn(false);
    ReadingStore._onMessages();
    advanceClock(1000);
    expect(request).not.toHaveBeenCalled();
  });

  it('makes no request for a thread triage flagged as spam', function () {
    (TriageStore.enabled as jasmine.Spy).andReturn(true);
    spyOn(TriageStore, 'entry').andReturn({ s: 0.99, a: 0 });
    spyOn(TriageStore, 'threshold').andReturn(0.9);
    ReadingStore._onMessages();
    advanceClock(1000);
    expect(request).not.toHaveBeenCalled();
  });

  it('caches a 422 as failed and does not ask again', async function () {
    request.andReturn(Promise.reject(Object.assign(new Error('bad'), { statusCode: 422 })));
    ReadingStore._onMessages();
    advanceClock(1000);
    await settle();
    expect(ReadingStore._entries.get('t1')).toEqual({ k: 'm1', f: 1 });
    ReadingStore._onMessages();
    advanceClock(1000);
    expect(request.callCount).toBe(1);
  });

  it('does not repeat a request that failed with a server error', async function () {
    request.andReturn(Promise.reject(Object.assign(new Error('bad gateway'), { statusCode: 502 })));
    ReadingStore._onMessages();
    advanceClock(1000);
    await settle();
    expect(ReadingStore._entries.has('t1')).toBe(false);
    ReadingStore._onMessages();
    advanceClock(1000);
    expect(request.callCount).toBe(1);
  });

  it('stops asking after a 503', async function () {
    request.andReturn(Promise.reject(Object.assign(new Error('down'), { statusCode: 503 })));
    ReadingStore._onMessages();
    advanceClock(1000);
    await settle();
    expect(ReadingStore.available()).toBe(false);
    expect(ReadingStore._entries.has('t1')).toBe(false);
  });

  it('posts a draft request and returns the three tones', async function () {
    request.andReturn(Promise.resolve(drafts));
    const out = await ReadingStore.draft(thread, items());
    expect(request.mostRecentCall.args[0].path).toBe('/api/ai/draft');
    expect(out).toEqual(drafts);
  });

  it('throws when the draft response is malformed', async function () {
    request.andReturn(Promise.resolve({ default: 'a' }));
    let error: Error | null = null;
    try {
      await ReadingStore.draft(thread, items());
    } catch (err) {
      error = err;
    }
    expect(error && error.message).toBe('malformed');
  });
});
