# Mute Senders per Account

**Date:** September 22, 2026

## Purpose and behavior

Sender muting keeps email warm-up traffic from creating unread mail and notifications. Each mute belongs to one receiving account and one exact sender address.

For example, muting `hi@doteli.org` in a message received by `hi@terlido.com` affects only that receiving account. Messages from `hi@doteli.org` to another connected account retain their normal read status and notification behavior.

Muting marks existing unread messages from the sender as read and does the same for incoming messages while Mailspring is running. It suppresses new-mail desktop notifications and sounds for matching messages. Messages remain in their folders; muting does not archive, delete, or block delivery.

## How to use it

1. Open an email in the receiving account, or open one from the unified inbox.
2. Right-click the sender's name or email address at the top of the open message.
3. Select **Mute Sender for This Account (Mark as Read)**.

The menu is attached to the sender in the message header, not the message row in the inbox. The message's owning account determines the mute scope, including in a unified inbox.

To reverse the setting, right-click the same sender and choose **Unmute Sender for This Account**. Alternatively, open **Preferences → General → Muted Senders**. Each row shows the sender and receiving account, with an **Unmute** button.

Unmuting restores normal handling for future messages in that account. It does not turn previously read messages back into unread messages, or remove a mute for the same sender in another account.

## Implementation

`app/src/flux/stores/muted-senders-store.ts` owns matching and automatic read tasks. Its saved configuration is `core.reading.mutedSenders`, an array of objects:

```json
[
  {
    "accountId": "receiving-account-id",
    "email": "sender@example.com"
  }
]
```

Sender addresses are trimmed and compared case-insensitively, using exact address matches rather than display names, substrings, or domains. The account ID must also match. Entries without an account ID, including legacy plain-string entries, do not act as global mutes.

The store checks every message persistence record, including ordinary server flag updates without `headersSyncComplete` or `fullSyncComplete`. These flags only accompany initial sync events; relying on them allowed muted mail to remain unread after later updates. It can mark matching messages read before their bodies finish downloading and operates independently of whether desktop notifications are enabled. Read-state persistence events do not queue further tasks because already-read messages are excluded. On startup and configuration changes, it also checks cached unread, non-draft messages against the current settings.

Read changes use `ChangeUnreadTask` through the existing sync engine. Tasks contain only matching messages, grouped by account and batched in groups of up to 100. They do not mark an entire conversation read, so unrelated messages within a thread remain unaffected. Automatic tasks are not added to the undo history. Message-scoped tasks omit the empty `threadIds` key when serialized: the sync engine gives that key precedence over `messageIds`, even when empty. Keeping both keys caused tasks to complete without changing any mail.

`app/internal_packages/unread-notifications/lib/main.ts` checks the mute before considering a new message for notification, after asynchronous thread lookup, and before draining the notification queue. These checks suppress notifications without waiting for the read-status task to complete.

`message-item.tsx` passes the owning account ID into `message-participants.tsx`, which provides the sender context menu. `preferences-general.tsx` lists saved mutes with their receiving account and provides removal controls. The config schema and `mailspring-exports` expose the new store to these packages.

## Limits

- This is a local Mailspring preference, not a provider-side mail rule. Automatic processing requires Mailspring to be running and the account to sync; it does not configure notifications in other email clients.
- Existing matching unread messages are included across folders in the selected account, not only its inbox. Drafts are excluded.
- Unmuting does not cancel read tasks that have already been queued.
- The feature does not measure or report warm-up progress.

## Validation and build

Run the focused regression suite from the repository root:

```bash
node scripts/tests/muted-senders.test.js
node scripts/tests/change-mail-task.test.js
npm run typecheck
```

The 13 focused tests cover ordinary updates without sync-complete flags, repeated unread updates, read-event loop prevention, ignored deletion/thread events, exact sender matching, account isolation, existing mail, incoming sync events, disabled notifications, notification timing, queued summaries, unmuting, and invalid global entries. They load the production store and notifier with mocked database, configuration, and notification services; they do not replace a live provider integration test.

The focused suite, TypeScript checks, and ESLint on the changed application files passed. A Linux production build was generated with:

```bash
npm run build -- --skip-installers
```

The packaged files were checked for the account-scoped mute controls, installed into the existing Linux application directory, and verified against the build. The updated app launched successfully. Live sender-menu interaction and provider-side read synchronization were not verified in this session.

## Sidebar unread fix validation

The serialization regression tests load the production model, attributes, and read-task classes, checking message targeting through serialization and cloning and preserving thread-targeted undo behavior. In the running app, applying the serialization fix and reprocessing existing mutes cleared all 22 matching unread messages across the four configured account/sender pairs. The sidebar count store matched the database afterward.
