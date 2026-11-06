import { MailspringAPIRequest } from 'mailspring-exports';
import TriageScorer from '../lib/triage-scorer';
import TriageStore from '../lib/triage-store';

async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('TriageScorer', function () {
  let enabled: boolean;
  let request: jasmine.Spy;

  beforeEach(function () {
    enabled = true;
    TriageScorer._queue = [];
    TriageScorer._inFlight.clear();
    TriageScorer._active = 0;
    TriageScorer._retries.clear();
    TriageScorer._pauseMs = 0;
    TriageScorer._pausedUntil = 0;
    TriageScorer._halted = false;
    spyOn(TriageStore, 'enabled').andCallFake(() => enabled);
    spyOn(TriageStore, 'has').andReturn(false);
    spyOn(TriageStore, 'setScore');
    spyOn(TriageStore, 'setFailed');
    spyOn(TriageScorer, '_textFor').andReturn(Promise.resolve('From: a\nSubject: b\n\nc'));
    request = spyOn(MailspringAPIRequest, 'makeRequest');
  });

  it('makes no request while the feature is off', async function () {
    enabled = false;
    request.andReturn(Promise.resolve({ spam: 0.1, attention: 0.5 }));
    TriageScorer.enqueue(['t1']);
    await settle();
    expect(request).not.toHaveBeenCalled();
  });

  it('stores the score it receives', async function () {
    request.andReturn(Promise.resolve({ spam: 0.97, attention: 0.28 }));
    TriageScorer.enqueue(['t1']);
    await settle();
    expect(TriageStore.setScore).toHaveBeenCalledWith('t1', 0.97, 0.28);
  });

  it('marks a thread failed when the backend answers 422', async function () {
    request.andReturn(Promise.reject(Object.assign(new Error('bad'), { statusCode: 422 })));
    TriageScorer.enqueue(['t1']);
    await settle();
    expect(TriageStore.setFailed).toHaveBeenCalledWith('t1');
  });

  it('queues the thread again and pauses when the backend answers 429', async function () {
    request.andReturn(Promise.reject(Object.assign(new Error('slow'), { statusCode: 429 })));
    TriageScorer.enqueue(['t1']);
    await settle();
    expect(TriageStore.setFailed).not.toHaveBeenCalled();
    expect(TriageScorer._queue[0]).toBe('t1');
    expect(TriageScorer._pausedUntil).toBeGreaterThan(Date.now());
  });

  it('stops scoring when the backend answers 503', async function () {
    request.andReturn(Promise.reject(Object.assign(new Error('no key'), { statusCode: 503 })));
    TriageScorer.enqueue(['t1', 't2']);
    await settle();
    expect(TriageScorer._halted).toBe(true);
    expect(request.callCount).toBeLessThan(3);
  });
});
