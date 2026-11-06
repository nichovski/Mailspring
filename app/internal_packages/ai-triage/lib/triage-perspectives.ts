import {
  Thread,
  localized,
  CategoryStore,
  DatabaseStore,
  MailboxPerspective,
  MutableQuerySubscription,
  QueryResultSet,
} from 'mailspring-exports';
import TriageStore from './triage-store';
import { orderThreads } from './triage-logic';

const WINDOW = 300;

function inboxQuery(accountIds: string[]) {
  const inboxIds = CategoryStore.getCategoriesWithRoles(accountIds, 'inbox').map((c) => c.id);
  return DatabaseStore.findAll<Thread>(Thread)
    .where([Thread.attributes.categories.containsAny(inboxIds)])
    .where({ inAllMail: true })
    .order(Thread.attributes.lastMessageReceivedTimestamp.descending())
    .limit(WINDOW);
}

/**
 * The newest inbox threads, filtered and ordered by score in memory. A score change or a new
 * spam threshold re-emits the loaded window with no database query. The window is fixed, so
 * scrolling asks for nothing more. The emitted set has no query: consumers then match rows
 * by id, which is right for a set the database cannot express.
 */
class TriageQuerySubscription extends MutableQuerySubscription<Thread> {
  _mode: 'priority' | 'spam';
  _unlisten: () => void;

  constructor(accountIds: string[], mode: 'priority' | 'spam') {
    super(inboxQuery(accountIds), { emitResultSet: true, updateOnSeparateThread: true });
    this._mode = mode;
    this._unlisten = TriageStore.listen(() => {
      if (this._set && !this._updateInFlight) {
        this._createResultAndTrigger();
      }
    });
  }

  replaceRange = () => {};

  onLastCallbackRemoved() {
    this._unlisten();
  }

  _createResultAndTrigger() {
    const threads = orderThreads(
      this._set.models().filter(Boolean),
      TriageStore.entry,
      TriageStore.threshold(),
      this._mode
    );
    const modelsHash: { [id: string]: Thread } = {};
    threads.forEach((t) => {
      modelsHash[t.id] = t;
    });
    this._lastResult = new QueryResultSet<Thread>({
      _ids: threads.map((t) => t.id),
      _modelsHash: modelsHash,
      _offset: 0,
      _query: null,
    });
    this._callbacks.forEach((callback) => callback(this._lastResult));

    if (this._updateInFlight) {
      this._updateInFlight = false;
      this._processChangeRecords();
    }
  }
}

class TriageMailboxPerspective extends MailboxPerspective {
  isAiTriage = true;
  _mode: 'priority' | 'spam';

  constructor(accountIds: string[], mode: 'priority' | 'spam') {
    super(accountIds);
    this._mode = mode;
  }

  threads() {
    return new TriageQuerySubscription(this.accountIds, this._mode);
  }

  canReceiveThreadsFromAccountIds() {
    return false;
  }

  // Archive, trash and the like act as they do in the Inbox these threads come from.
  _inbox() {
    return MailboxPerspective.forInbox(this.accountIds);
  }

  tasksForRemovingItems(threads: Thread[], source?: string) {
    return this._inbox().tasksForRemovingItems(threads, source);
  }

  sourceFolderIdsForAccount(accountId: string) {
    return this._inbox().sourceFolderIdsForAccount(accountId);
  }
}

export class PriorityPerspective extends TriageMailboxPerspective {
  name = localized('Priority');
  iconName = 'important.png';

  constructor(accountIds: string[]) {
    super(accountIds, 'priority');
  }

  emptyMessage() {
    return localized('No priority mail');
  }
}

export class ProbableSpamPerspective extends TriageMailboxPerspective {
  name = localized('Probable spam');
  iconName = 'spam.png';

  constructor(accountIds: string[]) {
    super(accountIds, 'spam');
  }

  emptyMessage() {
    return localized('No probable spam');
  }
}

export const PriorityExtension = {
  name: 'AiTriagePriorityExtension',
  sidebarItem: (accountIds: string[]) => ({
    id: 'AiTriagePriority',
    name: localized('Priority'),
    iconName: 'important.png',
    perspective: new PriorityPerspective(accountIds),
    insertAtTop: true,
  }),
};

export const ProbableSpamExtension = {
  name: 'AiTriageProbableSpamExtension',
  sidebarItem: (accountIds: string[]) => ({
    id: 'AiTriageProbableSpam',
    name: localized('Probable spam'),
    iconName: 'spam.png',
    perspective: new ProbableSpamPerspective(accountIds),
    insertAtTop: true,
  }),
};
