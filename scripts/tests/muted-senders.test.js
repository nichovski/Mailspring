const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relativePath, imports, AppEnv) {
  const filename = path.resolve(__dirname, '../..', relativePath);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(
    code,
    {
      exports,
      console,
      AppEnv,
      setTimeout,
      require: (name) => {
        assert.ok(name in imports, `Unexpected import: ${name}`);
        return imports[name];
      },
    },
    { filename }
  );
  return exports;
}

function setup() {
  const settings = {
    'core.reading.mutedSenders': [],
    'core.notifications.enabled': true,
    'core.notifications.sounds': true,
  };
  const observers = {};
  const tasks = [];
  const displayed = [];
  const sounds = [];
  let cached = [];
  class Message {}
  class Thread {}
  Thread.attributes = { id: { in: (ids) => ids } };
  const listeners = [];
  const DatabaseStore = {
    listen: (callback) => {
      listeners.push(callback);
      return () => {};
    },
    findAll: async (model) =>
      model === Message ? cached : [{ id: 'thread', categories: [{ role: 'inbox' }] }],
  };
  const Actions = { queueTask: (task) => tasks.push(task) };
  const AppEnv = {
    isMainWindow: () => true,
    inSpecMode: () => true,
    config: {
      get: (key) => settings[key],
      set: (key, value) => {
        settings[key] = value;
        observers[key]?.();
      },
      observe: (key, callback) => {
        observers[key] = callback;
        callback();
      },
    },
  };
  class Store {
    listenTo(source, callback) {
      source.listen(callback);
    }
  }
  class ChangeUnreadTask {
    constructor(data) {
      Object.assign(this, data);
    }
  }
  const { default: store } = load(
    'app/src/flux/stores/muted-senders-store.ts',
    {
      'mailspring-store': Store,
      '../actions': Actions,
      '../models/message': { Message },
      '../tasks/change-unread-task': { ChangeUnreadTask },
      './database-store': DatabaseStore,
    },
    AppEnv
  );
  const { Notifier } = load(
    'app/internal_packages/unread-notifications/lib/main.ts',
    {
      underscore: require('underscore'),
      'mailspring-exports': {
        Message,
        Thread,
        Actions,
        DatabaseStore,
        MutedSendersStore: store,
        AccountStore: { accountForEmail: () => null },
        NativeNotifications: {
          displayNotification: async (notification) => {
            displayed.push(notification);
          },
          displaySummaryNotification: async (notification) => {
            displayed.push(notification);
          },
        },
        SoundRegistry: { playSound: (sound) => sounds.push(sound) },
        localized: (s) => s,
      },
    },
    AppEnv
  );
  const notifier = new Notifier();
  const message = (email, overrides = {}) =>
    Object.assign(new Message(), {
      id: 'message',
      threadId: 'thread',
      accountId: 'account',
      unread: true,
      draft: false,
      date: new Date(Date.now() + 1000),
      from: [{ email, displayName: () => email }],
      ...overrides,
    });
  return {
    store,
    notifier,
    tasks,
    settings,
    displayed,
    sounds,
    message,
    cache: (messages) => {
      cached = messages;
    },
    sync: (messages, flag = 'headersSyncComplete') =>
      store._onDatabaseChanged({
        type: 'persist',
        objectClass: 'Message',
        objects: messages,
        objectsRawJSON: messages.map(({ id }) => ({ id, [flag]: true })),
      }),
  };
}

test('sender matching is exact, case-insensitive, persistent, and reversible', () => {
  const h = setup();
  h.store.setMuted('account', ' Warmup@Example.com ', true);
  assert.equal(h.store.isMuted('account', 'warmup@example.com'), true);
  assert.equal(h.store.isMuted('account', 'otherwarmup@example.com'), false);
  assert.equal(h.store.isMuted('account', 'warmup@example.com.evil'), false);
  h.store.setMuted('account', 'WARMUP@example.com', true);
  assert.equal(h.settings['core.reading.mutedSenders'].length, 1);
  h.store.setMuted('account', 'warmup@example.com', false);
  assert.equal(h.store.isMuted('account', 'warmup@example.com'), false);
});

test('existing mail is marked read per message and per account, leaving unrelated mail alone', async () => {
  const h = setup();
  h.cache([
    h.message('warmup@example.com', { id: 'a' }),
    h.message('warmup@example.com', { id: 'b', accountId: 'second' }),
    h.message('person@example.com', { id: 'c' }),
    h.message('warmup@example.com', { id: 'draft', draft: true }),
    h.message('warmup@example.com', { id: 'read', unread: false }),
  ]);
  h.store.setMuted('account', 'warmup@example.com', true);
  await new Promise(setImmediate);
  assert.equal(h.tasks.length, 1);
  assert.deepEqual(
    h.tasks.map((task) => task.messages.map((m) => m.id).join()),
    ['a']
  );
  for (const task of h.tasks) {
    assert.equal(task.unread, false);
    assert.equal(task.threads, undefined);
  }
});

test('header sync marks old and new muted mail read even with notifications disabled', () => {
  const h = setup();
  h.store.setMuted('account', 'warmup@example.com', true);
  h.settings['core.notifications.enabled'] = false;
  h.sync([h.message('warmup@example.com', { date: new Date(0) })]);
  assert.equal(h.tasks.length, 1);
  assert.equal(h.tasks[0].unread, false);
  h.sync([h.message('warmup@example.com', { unread: false })], 'fullSyncComplete');
  assert.equal(h.tasks.length, 1);
});

test('muted messages never enter notifications or play sounds', async () => {
  const h = setup();
  h.store.setMuted('account', 'warmup@example.com', true);
  await h.notifier._onMessagesChanged([h.message('warmup@example.com')], new Set(['message']));
  assert.equal(h.displayed.length, 0);
  assert.equal(h.sounds.length, 0);
  assert.equal(h.notifier.unnotifiedQueue.length, 0);
});

test('mute is rechecked after asynchronous thread lookup', async () => {
  const h = setup();
  const pending = h.notifier._onNewMessagesReceived([h.message('warmup@example.com')]);
  h.store.setMuted('account', 'warmup@example.com', true);
  await pending;
  assert.equal(h.displayed.length, 0);
  assert.equal(h.sounds.length, 0);
});

test('queued muted messages are removed before summary notifications', async () => {
  const h = setup();
  h.notifier.unnotifiedQueue = Array.from({ length: 5 }, () => ({
    message: h.message('warmup@example.com'),
  }));
  h.store.setMuted('account', 'warmup@example.com', true);
  await h.notifier._notifyMessages();
  assert.equal(h.displayed.length, 0);
  assert.equal(h.notifier.hasScheduledNotify, false);
});

test('unmuting restores notifications and stops automatic read tasks', async () => {
  const h = setup();
  h.store.setMuted('account', 'warmup@example.com', true);
  h.store.setMuted('account', 'warmup@example.com', false);
  h.sync([h.message('warmup@example.com')]);
  assert.equal(h.tasks.length, 0);
  await h.notifier._onMessagesChanged([h.message('warmup@example.com')], new Set(['message']));
  assert.equal(h.displayed.length, 1);
  assert.equal(h.sounds.length, 1);
});

test('other senders in the same thread still notify while a sender is muted', async () => {
  const h = setup();
  h.store.setMuted('account', 'warmup@example.com', true);
  await h.notifier._onMessagesChanged(
    [h.message('warmup@example.com'), h.message('person@example.com', { id: 'other' })],
    new Set(['message', 'other'])
  );
  assert.equal(h.displayed.length, 1);
  assert.equal(h.displayed[0].messageId, 'other');
  assert.equal(h.sounds.length, 1);
});

test('the same sender remains unread and notifies in another receiving account', async () => {
  const h = setup();
  h.store.setMuted('account', 'hi@doteli.org', true);
  const muted = h.message('hi@doteli.org', { id: 'muted' });
  const other = h.message('hi@doteli.org', { id: 'other', accountId: 'second' });
  h.sync([muted, other]);
  assert.equal(h.tasks.length, 1);
  assert.equal(h.tasks[0].messages.length, 1);
  assert.equal(h.tasks[0].messages[0].id, 'muted');
  await h.notifier._onMessagesChanged([muted, other], new Set(['muted', 'other']));
  assert.equal(h.displayed.length, 1);
  assert.equal(h.displayed[0].messageId, 'other');
  assert.equal(h.sounds.length, 1);
});

test('unmuting a sender in one account preserves their mute in another', () => {
  const h = setup();
  h.store.setMuted('account', 'hi@doteli.org', true);
  h.store.setMuted('second', 'hi@doteli.org', true);
  h.store.setMuted('account', 'hi@doteli.org', false);
  assert.equal(h.store.isMuted('account', 'hi@doteli.org'), false);
  assert.equal(h.store.isMuted('second', 'hi@doteli.org'), true);
});

test('missing account IDs and old global entries cannot mute all accounts', () => {
  const h = setup();
  h.settings['core.reading.mutedSenders'] = ['hi@doteli.org'];
  assert.equal(h.store.isMuted('account', 'hi@doteli.org'), false);
  h.store.setMuted('', 'hi@doteli.org', true);
  assert.equal(h.store.isMuted('second', 'hi@doteli.org'), false);
});
