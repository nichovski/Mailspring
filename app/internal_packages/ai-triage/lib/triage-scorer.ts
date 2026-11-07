import {
  Rx,
  Thread,
  Message,
  Utils,
  AccountStore,
  CategoryStore,
  DatabaseStore,
  MailspringAPIRequest,
} from 'mailspring-exports';
import TriageStore from './triage-store';
import { buildState, toScore } from './triage-logic';

export const WINDOW = 200;
const CONCURRENCY = 3;
const MAX_RETRIES = 3;
const FIRST_PAUSE_MS = 30_000;
const MAX_PAUSE_MS = 15 * 60_000;

/**
 * Scores the newest inbox threads that have no score yet, a few at a time. Backfill and new
 * mail use the same path: new threads enter the newest-200 window, and enabling the feature
 * makes the current window the backfill.
 */
class TriageScorer {
  _queue: string[] = [];
  _inFlight = new Set<string>();
  _active = 0;
  _retries = new Map<string, number>();
  _pauseMs = 0;
  _pausedUntil = 0;
  _halted = false;
  _subscription?: { dispose(): void };
  _inboxKey = '';
  _unlistenCategories?: () => void;

  start() {
    this._halted = false;
    this._unlistenCategories = CategoryStore.listen(this._watchInbox);
    this._watchInbox();
  }

  stop() {
    this._subscription?.dispose();
    this._subscription = undefined;
    this._unlistenCategories?.();
    this._unlistenCategories = undefined;
    this._queue = [];
    this._inboxKey = '';
  }

  _watchInbox = () => {
    const inboxIds = AccountStore.accounts()
      .map((a) => CategoryStore.getInboxCategory(a))
      .filter(Boolean)
      .map((c) => c.id);
    const key = inboxIds.join(',');
    if (key === this._inboxKey) {
      return;
    }
    this._inboxKey = key;
    this._subscription?.dispose();
    if (inboxIds.length === 0) {
      return;
    }
    const query = DatabaseStore.findAll<Thread>(Thread)
      .where([Thread.attributes.categories.containsAny(inboxIds)])
      .where({ inAllMail: true })
      .order(Thread.attributes.lastMessageReceivedTimestamp.descending())
      .limit(WINDOW);
    this._subscription = Rx.Observable.fromQuery(query).subscribe((threads: Thread[]) =>
      this.enqueue(threads.map((t) => t.id))
    );
  };

  enqueue(threadIds: string[]) {
    if (!TriageStore.enabled() || this._halted) {
      return;
    }
    for (const id of threadIds) {
      if (!TriageStore.has(id) && !this._inFlight.has(id) && !this._queue.includes(id)) {
        this._queue.push(id);
      }
    }
    this._pump();
  }

  _pump() {
    if (!TriageStore.enabled() || this._halted) {
      return;
    }
    const wait = this._pausedUntil - Date.now();
    if (wait > 0) {
      setTimeout(() => this._pump(), wait);
      return;
    }
    while (this._active < CONCURRENCY && this._queue.length > 0) {
      const id = this._queue.shift();
      this._active += 1;
      this._inFlight.add(id);
      this._score(id).finally(() => {
        this._active -= 1;
        this._inFlight.delete(id);
        this._pump();
      });
    }
  }

  async _textFor(threadId: string): Promise<string | null> {
    const messages = await DatabaseStore.findAll<Message>(Message, { threadId }).include(
      Message.attributes.body
    );
    const latest = messages.filter((m) => !m.draft).sort((a, b) => +b.date - +a.date)[0];
    if (!latest) {
      return null;
    }
    const body = Utils.extractTextFromHtml(latest.body, { maxLength: 50000 }) || latest.snippet;
    return buildState(latest.from[0], latest.subject, body || '');
  }

  async _score(threadId: string) {
    try {
      const text = await this._textFor(threadId);
      if (!TriageStore.enabled()) {
        return;
      }
      if (text === null) {
        TriageStore.setFailed(threadId);
        return;
      }
      const json = await MailspringAPIRequest.makeRequest({
        server: 'identity',
        method: 'POST',
        path: '/api/ai/triage',
        json: true,
        body: { text },
        timeout: 25000,
      });
      const score = toScore(json);
      if (!score) {
        TriageStore.setFailed(threadId);
        return;
      }
      this._pauseMs = 0;
      TriageStore.setScore(threadId, score.s, score.a);
    } catch (err) {
      this._onError(threadId, err.statusCode);
    }
  }

  _onError(threadId: string, status?: number) {
    if ([401, 402, 503].includes(status)) {
      console.warn(`ai-triage: scoring stopped, the backend answered ${status}`);
      this._halted = true;
      this._queue = [];
      return;
    }
    const transient = status === undefined || status === 429 || status >= 500;
    if (!transient) {
      TriageStore.setFailed(threadId);
      return;
    }
    const retries = (this._retries.get(threadId) || 0) + 1;
    this._retries.set(threadId, retries);
    if (retries >= MAX_RETRIES) {
      TriageStore.setFailed(threadId);
    } else {
      this._queue.unshift(threadId);
    }
    this._pauseMs = Math.min(MAX_PAUSE_MS, this._pauseMs ? this._pauseMs * 2 : FIRST_PAUSE_MS);
    this._pausedUntil = Date.now() + this._pauseMs;
  }
}

export default new TriageScorer();
