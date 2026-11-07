import {
  Actions,
  FocusedPerspectiveStore,
  MailspringAPIRequest,
  Message,
  Thread,
} from 'mailspring-exports';
import AskStore from '../lib/ask-store';

async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

const filters = {
  from: ['Lena'],
  to: [],
  subject: [],
  words: ['payout'],
  since: '',
  before: '',
  unread: false,
  attachment: false,
};
const message = new Message({
  threadId: 't1',
  from: [],
  date: new Date('2026-11-06T09:41:00Z'),
  body: 'Tuesday',
  plaintext: true,
});

describe('AskStore', function () {
  let request: jasmine.Spy;
  let submitted: jasmine.Spy;
  let matches: jasmine.Spy;
  let perspective: jasmine.Spy;

  const callsTo = (path: string) => request.calls.filter((c) => c.args[0].path === path).length;

  beforeEach(function () {
    AskStore._ask = null;
    AskStore._searches.clear();
    request = spyOn(MailspringAPIRequest, 'makeRequest').andCallFake(({ path }) =>
      Promise.resolve(
        path === '/api/ai/ask/search' ? filters : { answer: 'Tuesday.', sources: [1, 5] }
      )
    );
    submitted = spyOn(Actions, 'searchQuerySubmitted');
    matches = spyOn(AskStore, '_matches').andReturn(Promise.resolve([new Thread({ id: 't1' })]));
    spyOn(AskStore, '_messages').andReturn(Promise.resolve([message]));
    perspective = spyOn(FocusedPerspectiveStore, 'current').andReturn({ accountIds: ['a1'] });
  });

  it('searches, then answers from the matches', async function () {
    AskStore.ask('When does the payout arrive?');
    await settle();
    const ask = AskStore.current();
    expect(ask.status).toBe('done');
    expect(ask.answer).toBe('Tuesday.');
    expect(ask.pills).toEqual(['From: Lena', 'Words: payout']);
    expect(submitted).toHaveBeenCalledWith('from:"Lena" "payout"');
    expect(callsTo('/api/ai/ask/answer')).toBe(1);
    const body = request.calls.find((c) => c.args[0].path === '/api/ai/ask/answer').args[0].body;
    expect(body.conversations[0].messages[0].text).toBe('Tuesday');
    expect(ask.sources.map((t) => t.id)).toEqual(['t1']);
  });

  it('retries with only the people and dates when the topic finds nothing', async function () {
    matches.andCallFake((q: string) =>
      Promise.resolve(q.includes('payout') ? [] : [new Thread({ id: 't1' })])
    );
    AskStore.ask('What about the payout?');
    await settle();
    expect(matches.calls.length).toBe(2);
    expect(submitted).toHaveBeenCalledWith('from:"Lena"');
    expect(AskStore.current().pills).toEqual(['From: Lena']);
    expect(AskStore.current().answer).toBe('Tuesday.');
  });

  it('does not ask the model when nothing matches', async function () {
    matches.andReturn(Promise.resolve([]));
    AskStore.ask('anything');
    await settle();
    expect(matches.calls.length).toBe(2);
    expect(callsTo('/api/ai/ask/answer')).toBe(0);
    expect(AskStore.current().answer).toBe('No matching mail found.');
  });

  it('stops when the filters are empty', async function () {
    request.andReturn(Promise.resolve({}));
    AskStore.ask('anything');
    await settle();
    expect(AskStore.current().status).toBe('error');
    expect(submitted).not.toHaveBeenCalled();
  });

  it('asks the search call once for the same question', async function () {
    AskStore.ask('same');
    await settle();
    AskStore.ask('same');
    await settle();
    expect(callsTo('/api/ai/ask/search')).toBe(1);
    expect(callsTo('/api/ai/ask/answer')).toBe(2);
  });

  it('says AI is unavailable when the backend answers 503', async function () {
    request.andReturn(Promise.reject({ statusCode: 503 }));
    AskStore.ask('anything');
    await settle();
    expect(AskStore.current().answer).toBe('AI is not available right now.');
  });

  it('drops a late result after clear()', async function () {
    AskStore.ask('anything');
    AskStore.clear();
    await settle();
    expect(AskStore.current()).toBe(null);
    expect(submitted).not.toHaveBeenCalled();
  });

  it('clears when the focused view is not the ask search', async function () {
    AskStore.ask('anything');
    await settle();
    perspective.andReturn({ accountIds: ['a1'], searchQuery: 'other' });
    AskStore._onPerspective();
    expect(AskStore.current()).toBe(null);
  });
});
