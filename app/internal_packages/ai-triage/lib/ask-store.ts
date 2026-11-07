import MailspringStore from 'mailspring-store';
import {
  Actions,
  DatabaseStore,
  FocusedPerspectiveStore,
  localized,
  MailspringAPIRequest,
  Message,
  SearchQueryParser,
  Thread,
} from 'mailspring-exports';
import {
  ASK_MAX_THREADS,
  AskSearch,
  askConversations,
  askPick,
  broaden,
  toAnswer,
  toPills,
  toQuery,
  toSearch,
  todayString,
} from './assistant-logic';

const BODY_WAIT_MS = 20000;
const BODY_POLL_MS = 500;

type AskStatus = 'searching' | 'answering' | 'done' | 'error';
export interface Ask {
  question: string;
  status: AskStatus;
  query?: string;
  pills?: string[];
  answer?: string;
  sources?: Thread[];
}

/**
 * One question at a time. The search filters are cached per day and question in memory only, so
 * repeating a question costs one call; answers are not cached because they depend on the mail.
 */
class AskStore extends MailspringStore {
  _ask: Ask | null = null;
  _searches = new Map<string, AskSearch>();

  constructor() {
    super();
    this.listenTo(FocusedPerspectiveStore, this._onPerspective);
  }

  current() {
    return this._ask;
  }

  clear() {
    this._ask = null;
    this.trigger();
  }

  // An ask lives while its search is the focused view; moving away drops it, including a late result.
  _onPerspective = () => {
    const searchQuery = (FocusedPerspectiveStore.current() as { searchQuery?: string }).searchQuery;
    if (this._ask && !(this._ask.query && this._ask.query === searchQuery)) {
      this.clear();
    }
  };

  _post(path: string, body: object, timeout: number) {
    return MailspringAPIRequest.makeRequest({
      server: 'identity',
      method: 'POST',
      path,
      json: true,
      body,
      timeout,
    });
  }

  async _matches(query: string, accountIds: string[]): Promise<Thread[]> {
    let q = DatabaseStore.findAll<Thread>(Thread).structuredSearch(
      SearchQueryParser.parse(`(${query}) NOT (in:trash OR in:spam)`)
    );
    if (accountIds.length === 1) {
      q = q.where({ accountId: accountIds[0] });
    }
    return q
      .background()
      .order(Thread.attributes.lastMessageReceivedTimestamp.descending())
      .limit(ASK_MAX_THREADS);
  }

  /**
   * The sync engine downloads bodies of older mail only on demand, so the bodies Ask will read are
   * requested and waited for briefly; any still missing fall back to the snippet or are skipped.
   */
  async _messages(threads: Thread[], alive: () => boolean): Promise<Message[]> {
    let messages = await DatabaseStore.findAll<Message>(Message)
      .where({ threadId: threads.map((t) => t.id) })
      .include(Message.attributes.body)
      .background();
    let missing = threads.flatMap((t) => askPick(t, messages)).filter((m) => m.body === null);
    if (missing.length && alive()) {
      Actions.fetchBodies(missing);
      const deadline = Date.now() + BODY_WAIT_MS;
      while (missing.length && Date.now() < deadline && alive()) {
        await new Promise((resolve) => setTimeout(resolve, BODY_POLL_MS));
        const arrived = (
          await DatabaseStore.findAll<Message>(Message)
            .where(Message.attributes.id.in(missing.map((m) => m.id)))
            .include(Message.attributes.body)
        ).filter((m) => m.body !== null);
        messages = messages.map((m) => arrived.find((a) => a.id === m.id) || m);
        missing = missing.filter((m) => !arrived.find((a) => a.id === m.id));
      }
    }
    return messages;
  }

  _set(ask: Ask, patch: Partial<Ask>) {
    Object.assign(ask, patch);
    this.trigger();
  }

  async ask(text: string) {
    const question = text.trim();
    if (!question) {
      return;
    }
    const ask: Ask = { question, status: 'searching' };
    this._ask = ask;
    this.trigger();
    const today = todayString(new Date());
    const key = `${today}\n${question}`;
    try {
      let search = this._searches.get(key);
      if (!search) {
        search = toSearch(await this._post('/api/ai/ask/search', { question, today }, 20000));
        if (search) {
          this._searches.set(key, search);
        }
      }
      if (this._ask !== ask) {
        return;
      }
      let query = search ? toQuery(search) : '';
      if (!query) {
        this._set(ask, {
          status: 'error',
          answer: localized(
            'Could not turn that into a search. Try naming a person, a subject or a date.'
          ),
        });
        return;
      }
      const accountIds = FocusedPerspectiveStore.current().accountIds;
      let threads = await this._matches(query, accountIds);
      const wider = threads.length === 0 && broaden(search);
      if (wider) {
        search = wider;
        query = toQuery(wider);
        threads = await this._matches(query, accountIds);
      }
      if (this._ask !== ask) {
        return;
      }
      this._set(ask, { query, pills: toPills(search) });
      Actions.searchQuerySubmitted(query);
      if (threads.length === 0) {
        this._set(ask, { status: 'done', answer: localized('No matching mail found.') });
        return;
      }
      this._set(ask, { status: 'answering' });
      const messages = await this._messages(threads, () => this._ask === ask);
      if (this._ask !== ask) {
        return;
      }
      const payload = askConversations(threads, messages);
      if (payload.conversations.length === 0) {
        this._set(ask, { status: 'done', answer: localized('No matching mail found.') });
        return;
      }
      const result = toAnswer(
        await this._post(
          '/api/ai/ask/answer',
          { question, today, conversations: payload.conversations },
          70000
        )
      );
      if (this._ask !== ask) {
        return;
      }
      if (!result) {
        throw new Error('malformed');
      }
      const sources = result.sources.map((n) => payload.threads[n - 1]).filter(Boolean);
      this._set(ask, { status: 'done', answer: result.answer, sources });
    } catch (err) {
      if (this._ask === ask) {
        const off = [401, 402, 503].includes(err.statusCode);
        this._set(ask, {
          status: 'error',
          answer: off
            ? localized('AI is not available right now.')
            : localized('Could not answer. Try again.'),
        });
      }
    }
  }
}

export default new AskStore();
