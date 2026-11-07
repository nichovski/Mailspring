import fs from 'fs';
import path from 'path';
import _ from 'underscore';
import MailspringStore from 'mailspring-store';
import {
  AccountStore,
  MailspringAPIRequest,
  Message,
  MessageStore,
  Thread,
} from 'mailspring-exports';
import TriageStore from './triage-store';
import { spamFlag } from './triage-logic';
import {
  buildThread,
  Drafts,
  lastMessage,
  parseEntries,
  ReadingEntry,
  ThreadPayload,
  Tone,
  toDrafts,
  toSummary,
} from './reading-logic';

const MAX_ENTRIES = 500;
const DWELL_MS = 1000;

type AiDraft = { drafts: Drafts; tone: Tone; headerMessageId?: string };

export const triageFlagged = (threadId: string) =>
  TriageStore.enabled() && !!spamFlag(TriageStore.entry(threadId), TriageStore.threshold());

/**
 * Summaries are asked for after a thread stays focused for a moment, and cached per thread for its
 * last non-draft message. The cache is a local file, like the triage scores, so reopening a thread
 * costs nothing. Drafts are never cached.
 */
class ReadingStore extends MailspringStore {
  _entries: Map<string, ReadingEntry> | null = null;
  _inFlight = new Map<string, string>();
  _halted = false;
  _timer: ReturnType<typeof setTimeout> | null = null;
  _pendingKey: string | null = null;
  _aiDrafts = new Map<string, AiDraft>();

  constructor() {
    super();
    MessageStore.listen(this._onMessages);
    TriageStore.listen(this._onMessages);
    AppEnv.config.onDidChange('ai-triage.reading', () => {
      this._halted = false;
      this.trigger();
    });
  }

  _file() {
    return path.join(AppEnv.getConfigDirPath(), 'ai-reading.json');
  }

  _all() {
    if (!this._entries) {
      try {
        this._entries = parseEntries(JSON.parse(fs.readFileSync(this._file(), 'utf8')));
      } catch (err) {
        this._entries = new Map();
      }
    }
    return this._entries;
  }

  enabled(): boolean {
    return !!AppEnv.config.get('ai-triage.reading');
  }

  available(): boolean {
    return this.enabled() && !this._halted;
  }

  summary(threadId: string, lastId: string) {
    const entry = this._all().get(threadId);
    return entry && 'points' in entry && entry.k === lastId ? entry : null;
  }

  loading(threadId: string) {
    return this._inFlight.has(threadId);
  }

  toggleDone(threadId: string, index: number) {
    const entry = this._all().get(threadId);
    if (!entry || !('points' in entry)) {
      return;
    }
    const done = new Set(entry.d || []);
    if (!done.delete(index)) {
      done.add(index);
    }
    this._set(threadId, { ...entry, d: [...done].sort((a, b) => a - b) });
  }

  _onMessages = () => {
    const thread = MessageStore.thread();
    const items = MessageStore.items();
    const last = thread && lastMessage(items);
    const entry = thread && this._all().get(thread.id);
    if (
      !this.available() ||
      !thread ||
      MessageStore.itemsLoading() ||
      !last ||
      triageFlagged(thread.id) ||
      entry?.k === last.id ||
      this._inFlight.get(thread.id) === last.id
    ) {
      this._clearTimer();
      return;
    }
    const key = `${thread.id}:${last.id}`;
    if (key === this._pendingKey) {
      return;
    }
    this._clearTimer();
    this._pendingKey = key;
    this._timer = setTimeout(() => {
      this._pendingKey = null;
      if (MessageStore.threadId() === thread.id) {
        this._fetch(thread, items, last.id);
      }
    }, DWELL_MS);
  };

  _clearTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._pendingKey = null;
  }

  _payload(thread: Thread, messages: Message[]): ThreadPayload {
    const account = AccountStore.accountForId(thread.accountId);
    return buildThread(thread.subject, messages, {
      name: account.name,
      email: account.emailAddress,
    });
  }

  _post(path: string, body: ThreadPayload, timeout: number): Promise<unknown> {
    return MailspringAPIRequest.makeRequest({
      server: 'identity',
      method: 'POST',
      path,
      json: true,
      body,
      timeout,
    });
  }

  _halt(status: number | undefined) {
    if ([401, 402, 503].includes(status)) {
      console.warn(`ai-reading: stopped, the backend answered ${status}`);
      this._halted = true;
      return true;
    }
    return false;
  }

  async _fetch(thread: Thread, messages: Message[], lastId: string) {
    const body = this._payload(thread, messages);
    this._inFlight.set(thread.id, lastId);
    this.trigger();
    try {
      const summary = toSummary(await this._post('/api/ai/summary', body, 25000));
      this._set(
        thread.id,
        summary ? { k: lastId, n: body.messages.length, ...summary } : { k: lastId, f: 1 }
      );
    } catch (err) {
      if (!this._halt(err.statusCode) && err.statusCode === 422) {
        this._set(thread.id, { k: lastId, f: 1 });
      }
    } finally {
      this._inFlight.delete(thread.id);
      this.trigger();
    }
  }

  async draft(thread: Thread, messages: Message[]): Promise<Drafts> {
    try {
      const drafts = toDrafts(
        await this._post('/api/ai/draft', this._payload(thread, messages), 35000)
      );
      if (!drafts) {
        throw new Error('malformed');
      }
      return drafts;
    } catch (err) {
      this._halt(err.statusCode);
      throw err;
    }
  }

  setAiDraft(replyToHeaderMessageId: string, drafts: Drafts) {
    this._aiDrafts.set(replyToHeaderMessageId, { drafts, tone: 'default' });
    this.trigger();
  }

  /** The AI draft state for a draft, bound to the draft's headerMessageId on first use. */
  aiDraft(draft: Message): AiDraft | null {
    const ai = this._aiDrafts.get(draft.replyToHeaderMessageId);
    if (!ai || (ai.headerMessageId && ai.headerMessageId !== draft.headerMessageId)) {
      return null;
    }
    ai.headerMessageId = draft.headerMessageId;
    return ai;
  }

  setTone(draft: Message, tone: Tone) {
    const ai = this.aiDraft(draft);
    if (ai) {
      ai.tone = tone;
      this.trigger();
    }
  }

  setDrafts(draft: Message, drafts: Drafts) {
    const ai = this.aiDraft(draft);
    if (ai) {
      ai.drafts = drafts;
      this.trigger();
    }
  }

  clearAiDraft(draft: Message) {
    this._aiDrafts.delete(draft.replyToHeaderMessageId);
    this.trigger();
  }

  _set(threadId: string, entry: ReadingEntry) {
    const all = this._all();
    all.delete(threadId);
    all.set(threadId, entry);
    if (all.size > MAX_ENTRIES) {
      all.delete(all.keys().next().value);
    }
    this._save();
    this._triggerSoon();
  }

  _triggerSoon = _.debounce(() => this.trigger(), 250);

  _save = _.debounce(() => {
    const entries = {};
    this._all().forEach((entry, id) => {
      entries[id] = entry;
    });
    const tmp = `${this._file()}.tmp`;
    fs.writeFile(tmp, JSON.stringify({ v: 1, entries }), (writeErr) => {
      if (writeErr) {
        console.warn('ai-reading: could not save summaries', writeErr);
        return;
      }
      fs.rename(tmp, this._file(), (renameErr) => {
        if (renameErr) {
          console.warn('ai-reading: could not save summaries', renameErr);
        }
      });
    });
  }, 2000);
}

export default new ReadingStore();
