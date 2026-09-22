import MailspringStore from 'mailspring-store';
import * as Actions from '../actions';
import { Message } from '../models/message';
import { ChangeUnreadTask } from '../tasks/change-unread-task';
import DatabaseStore from './database-store';
import type { DatabaseChangeRecord } from 'mailspring-exports';

const CONFIG_KEY = 'core.reading.mutedSenders';
const normalize = (email: string) => (email || '').trim().toLowerCase();

export class MutedSendersStore extends MailspringStore {
  constructor() {
    super();
    if (AppEnv.isMainWindow()) {
      this.listenTo(DatabaseStore, this._onDatabaseChanged);
      AppEnv.config.observe(CONFIG_KEY, () => {
        this._markExistingAsRead().catch((error) => console.error('Could not mute mail', error));
      });
    }
  }

  entries(): { accountId: string; email: string }[] {
    return (AppEnv.config.get(CONFIG_KEY) || []).filter(
      (entry) => entry && typeof entry.accountId === 'string' && typeof entry.email === 'string'
    );
  }

  isMuted(accountId: string, email: string) {
    const address = normalize(email);
    return (
      !!accountId &&
      !!address &&
      this.entries().some(
        (entry) => entry.accountId === accountId && normalize(entry.email) === address
      )
    );
  }

  isMessageMuted(message: Message) {
    return (
      !message.draft &&
      message.from.some((contact) => this.isMuted(message.accountId, contact.email))
    );
  }

  setMuted(accountId: string, email: string, muted: boolean) {
    const address = normalize(email);
    if (!accountId || !address) return;
    const remaining = this.entries().filter(
      (entry) => entry.accountId !== accountId || normalize(entry.email) !== address
    );
    AppEnv.config.set(
      CONFIG_KEY,
      muted ? [...remaining, { accountId, email: address }] : remaining
    );
  }

  _onDatabaseChanged = (record: DatabaseChangeRecord<Message>) => {
    if (record.type !== 'persist' || record.objectClass !== Message.name) return;
    const syncedIds = new Set(
      record.objectsRawJSON
        .filter((json) => json.headersSyncComplete || json.fullSyncComplete)
        .map((json) => json.id)
    );
    this._markAsRead(record.objects.filter((message) => syncedIds.has(message.id)));
  };

  async _markExistingAsRead() {
    if (!this.entries().length) return;
    const messages = await DatabaseStore.findAll<Message>(Message, { unread: true, draft: false });
    this._markAsRead(messages);
  }

  _markAsRead(messages: Message[]) {
    const byAccount = new Map<string, Message[]>();
    for (const message of messages) {
      if (!message.unread || !this.isMessageMuted(message)) continue;
      const group = byAccount.get(message.accountId) || [];
      group.push(message);
      byAccount.set(message.accountId, group);
    }
    for (const group of byAccount.values()) {
      for (let offset = 0; offset < group.length; offset += 100) {
        Actions.queueTask(
          new ChangeUnreadTask({
            messages: group.slice(offset, offset + 100),
            unread: false,
            source: 'Muted Sender',
            canBeUndone: false,
          })
        );
      }
    }
  }
}

export default new MutedSendersStore();
