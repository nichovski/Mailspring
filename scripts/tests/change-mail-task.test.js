const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../../app/src');
const cache = new Map();
function load(filename) {
  if (filename === path.join(root, 'flux/models/utils.ts')) {
    return { generateTempId: () => 'local-test' };
  }
  if (filename === path.join(root, 'intl.ts')) return { localized: (s) => s };
  if (filename === path.join(root, 'flux/attributes/matcher.ts')) return {};
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInThisContext(`(function(require, module, exports) {${code}\n})`, { filename })(
    (name) => name.startsWith('.') ? load(path.resolve(path.dirname(filename), `${name}.ts`)) : require(name),
    module,
    module.exports
  );
  return module.exports;
}
const { ChangeUnreadTask } = load(path.join(root, 'flux/tasks/change-unread-task.ts'));

test('message read tasks select messages in the sync engine and survive serialization', () => {
  const task = new ChangeUnreadTask({
    messages: [{ id: 'muted-message', accountId: 'account' }],
    unread: false,
    canBeUndone: false,
  });
  for (const candidate of [task, new ChangeUnreadTask(task.toJSON()), task.createIdenticalTask()]) {
    const json = candidate.toJSON();
    // Mailsync branches on key presence, not array length.
    const selected = 'threadIds' in json ? json.threadIds : json.messageIds;
    assert.deepEqual(selected, ['muted-message']);
    assert.equal('threadIds' in json, false);
    assert.equal(json.aid, 'account');
    assert.equal(json.unread, false);
    assert.equal(json.canBeUndone, false);
  }
});

test('thread read tasks retain their thread scope', () => {
  const task = new ChangeUnreadTask({ threads: [{ id: 'thread', accountId: 'account' }], unread: false });
  assert.deepEqual(task.toJSON().threadIds, ['thread']);
  assert.deepEqual(task.createUndoTask().toJSON().threadIds, ['thread']);
  assert.equal(task.createUndoTask().unread, true);
});
