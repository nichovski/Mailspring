# Smart Triage

**Date:** November 6, 2026 · **Branch:** `feat/ai-triage` (`616a8ce79`, `ea4d7041a`, `981817848`) · **Backend:** `mailspring-backend` `feat/ai-triage` (`66d4ed8`)

## What it does

Smart Triage scores new inbox mail with two numbers: the chance it is spam or phishing, and how much it deserves attention (0 to 1). It is off by default. Turning it on in **Preferences → Smart Triage** adds:

- **Priority** in the sidebar: inbox threads below the spam threshold, sorted by attention. Unscored threads come last.
- **Probable spam** in the sidebar: inbox threads at or above the spam threshold, highest first.
- A 4-bar attention meter in each scored thread row (High ≥ 0.75, Medium ≥ 0.4, Low ≥ 0.15, Very low), with an aria-label such as "Attention: High (0.92)".
- A chip in the row: "Spam 97%" at or above the threshold, "Maybe spam 58%" from 40% up to the threshold.
- A warning above the open message for spam ≥ 40%. Above the threshold it offers **Not spam** and **Delete**; below it offers **Not spam** and **Move to spam**. "Not spam" is remembered.
- A collapsible **Smart triage** card above the list in both views. Collapsed it reads "Smart triage · Spam above 90%"; open, it has a 50–99% slider. Moving the slider re-filters at once with no new requests.

The Inbox itself is not filtered. No model or vendor name appears in the UI.

## Why

This is phase 1 of the AI features in the approved Mailspring redesign. Triage came first because it is useful on its own and needs only scores, not generated text. Summaries, suggested replies and drafts are phase 2.

Decisions made with Bogdan:

- **Sort and meter only** in Priority. The design's "Act now / Worth a read / Low attention" group headers were left out.
- **Inbox stays unfiltered.** Spam above the threshold is only pulled out of Priority, not hidden from the Inbox.
- **Scores stay on the device** in a local file, not in synced thread metadata. Metadata rewrites the whole backend file on each write and sends a change record to every open list, which is too costly for hundreds of scores.
- **The key stays on the server.** The client calls the self-hosted backend with its identity token. The backend holds the OpenRouter key, the same way translation holds the DeepL key.

## How it works

Package: `app/internal_packages/ai-triage/`.

- `lib/main.ts` holds the config (`ai-triage.enabled`, default `false`; `ai-triage.spamThreshold`, default 90, range 50–99). It registers the badge (role `Thread:MailLabel`), the warning (role `MessageListHeaders`), the card (location `ThreadList`) and the preferences tab. Observing `ai-triage.enabled` registers or unregisters the two sidebar extensions and starts or stops the scorer. Turning it off while in Priority or Probable spam moves to the default view.
- `lib/triage-scorer.ts` runs in the main window only. It watches the newest 200 inbox threads and scores each one once. It runs 3 requests at a time. On a 429 it requeues the thread and pauses (30 s, doubling to 15 min). A 422 marks the thread failed. A 503 or 402 stops scoring until restart. Threads with only drafts are marked failed so they are not fetched again. It sends sender, subject and the first 4000 characters of the latest message.
- `lib/triage-store.ts` keeps scores in `<configDir>/ai-triage-scores.json` (`{ v: 1, scores }`, up to 5000 entries, oldest dropped). It writes with a temp file and rename, and tolerates a corrupt file. It triggers on score changes and on `ai-triage.spamThreshold` changes.
- `lib/triage-perspectives.ts` defines the two views. `TriageQuerySubscription` loads the newest 300 inbox threads and filters and sorts them in memory with `orderThreads`. A score or threshold change re-emits the loaded window with no database query. `replaceRange` is a no-op on purpose: the window is fixed, so scrolling asks for nothing. New mail still arrives through the normal change-record path.
- `lib/triage-logic.ts` holds the pure parts (meter level, spam flag, ordering, file parsing, text building). It is covered by `specs/ai-triage-logic-spec.ts`. The scorer is covered by `specs/ai-triage-scorer-spec.ts`.
- `account-sidebar/lib/sidebar-store.ts` now also listens to `ExtensionRegistry.AccountSidebar`, so the sidebar updates when the views are added or removed at runtime.

Backend: `POST /api/ai/triage` takes `{ text }` and returns `{ spam, attention }`. See `mailspring-backend/docs/ai-triage-endpoint.md`.

## Review

The change went through two independent reviewers (GLM-5.3 Flash, DeepSeek V4 Flash) on the full diff.

Fixed:

- The preferences tab was unregistered with `tabItem.sectionId`, which is undefined, so the tab stayed after deactivation. It now passes the tab item. The same bug exists in `mcp-server`, `category-mapper` and `composer-signature`; it was not changed there.
- Draft-only threads were fetched again on every update. They are now marked failed.
- Turning the feature off left the user in a view that no longer existed in the sidebar.
- The new strings in `en.json` were appended at the end; they are now in sorted order.
- Two specs could not fail. They now can.

Rejected, with the reason:

- "QueryResultSet ignores `_ids` / `_modelsHash`": its constructor reads exactly those keys.
- "`onLastCallbackRemoved` must call super to free the DB subscription": the base method is empty.
- "`TriageStore.listen` returns a Disposable": `MailspringStore.listen` returns a function.
- "The no-op `replaceRange` stops new mail from appearing": new mail comes through `_processChangeRecords`, not `replaceRange`. Confirmed live.
- "The Switch label shows twice": `Switch` uses `label` only as an aria-label.
- "Confident spam should offer Move to spam, not Delete": that is the approved design.
- "Requests in flight finish after turning it off": at most 3 finish and save their scores. No new request starts.

## Validation

- `npm run lint:check`, `npm run typecheck`: pass. `npm test -- --spec-file-pattern='ai-triage'`: 23 passing.
- Live, on a copy of the real profile (22 accounts) against the local backend: 200 of 200 threads scored, none failed. Priority sorted by attention with meters. Probable spam showed the real spam (95%, 92%). The warning showed "95% likely spam" with Not spam and Delete. Moving the slider to 55% moved 16 threads into Probable spam with no new requests (222 before and after). The card sits above the list. Turning the feature off moved Priority back to Inbox.

## Notes

- "Maybe spam" shows on some legitimate security mail (sign-in and MFA alerts scored 56–71%). The 40% floor for the chip may be too low.
- Unrelated: the client calls `POST /api/resolve-dav-hosts`, which the backend does not implement (404).
- Phase 2: summaries, suggested replies, drafts and compose AI, planned on `deepseek/deepseek-v4.1-flash-1017`.
