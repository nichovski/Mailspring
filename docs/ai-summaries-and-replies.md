# AI summaries and replies

**Date:** November 7, 2026 · **Branch:** `feat/ai-reading` · **Backend:** `mailspring-backend` `feat/ai-reading`

## What it does

Turn it on in **Preferences → Smart Triage → Summaries and replies**. It is off by default and does not need Smart Triage to be on. For the conversation you open, it shows:

- **A Summary card** above the messages:
  - 1 to 4 short points, with "of N messages" and a Hide/Show button;
  - a **For you** list of up to 3 action items with a due hint and a checkbox (the checkbox is local only);
  - the line "Made by AI, so it can be wrong. Check the messages for anything important."
- **Suggested replies** above the reply area: up to 3 short replies. A click opens an inline reply draft with that text above your signature and the quoted mail.
- **Draft with AI**: opens a reply draft written from the conversation. A bar in the composer offers:
  - the tones Default, Shorter and More formal;
  - Redo draft;
  - Discard;
  - the note "Drafted by AI from this thread. Read it before you send."

Nothing is ever sent automatically. Threads that show the Smart Triage spam warning get no summary and no suggestions. The New Look sidebar footer also has a **Sync New Mail Now** button: the same command as F5, which wakes every account's sync.

## Why

This is the phase 2 part of the redesign canvas: Summary, For you, suggested replies and AI drafts. The OpenRouter key stays on the self-hosted backend, as it does for triage. The model is `deepseek/deepseek-v4.1-flash-1017` (env `AI_READING_MODEL` on the backend), chosen with Bogdan when phase 1 shipped.

## How it works

- **When it asks.** `reading-store.ts` listens to `MessageStore`.
  - It sends a summary request only after a thread stays focused for 1 s, so arrowing through the list costs nothing.
  - Results are cached per thread, keyed by the last non-draft message id, so a new message refreshes the summary. The cache lives in memory and in `<configDir>/ai-reading.json` (500 entries, oldest dropped first).
  - On 401/402/503, requests stop until the setting is toggled.
  - A 422 is cached as failed for that message.
  - Other failures (timeout, 5xx) are remembered in memory, so `MessageStore` triggers cannot repeat a paid request. A restart retries.
- **What is sent.**
  - The newest 8 non-draft messages, each capped at 3000 characters and 12000 in total. Quoted text is removed with `QuotedHTMLTransformer` and HTML is turned into text with line breaks kept.
  - Also the account's name and address, so the server can mark your own messages "(me)" and "For you" items are about you.
- **Server.** `POST /api/ai/summary` and `POST /api/ai/draft` (see the backend's `docs/ai-reading-endpoints.md`). The draft endpoint returns all three tones in one call, so switching tone is instant and costs nothing.
- **Reply drafts.**
  - `Actions.composeReply` takes a new optional `body` (HTML). `DraftStore._onComposeReply` puts it in front of the reply body before `prepareNewDraft`, so the signature lands between the AI text and the quote. Without `body`, nothing changes for the existing callers.
  - Model text always goes through `textToHtml`, which escapes it and writes one `<div>` per line. Joining lines with `<br/>` made the editor show every blank line twice.
  - Tone and Redo replace everything above `<signature` or the native quote (`replaceReplyText`).
  - Discard is `Actions.destroyDraft`.
- **UI slots.**
  - The summary card uses `MessageListHeaders`.
  - The suggestions use a new `MessageListReplyArea` role, injected in `message-list.tsx` just before the reply area. It is not inside the reply area, which is itself a button.
  - The draft bar uses `Composer:Footer`.
- **Colours.** Two new variables, `@ai-triage-soft` and `@ai-triage-line`, give the card its tint in every theme. New Look uses the exact canvas colours.

## Decisions

- **Automatic summary after a 1 s dwell, not on click.** This follows the canvas. The cost is about $0.0002 per summary, measured on a real thread.
- **Three tones in one draft call.** A call per tone would make each tone click wait.
- **The server builds the prompt**, so it can mark "(me)" and the prompt can change without a client release.
- **Suggestions hide once the conversation has a draft.** This follows the canvas. It also avoids a second draft: after the first click the draft is no longer pristine, so `prefer-existing-if-pristine` would open another one.
- **The model's reasoning is off.** Its reasoning output counted against `max_tokens` and left the JSON cut off on a real thread. Without it, answers take 1 to 2 s.
- **No "Remind me" button.** Mailspring's only reminder code works on sent messages, so a reminder for any action item would need new code.
- **No model or provider name anywhere in the UI.**

## Review

GLM-5.3 Flash and DeepSeek V4 Flash reviewed both repos.

Fixed:
- A failed request (5xx or timeout) could repeat on every `MessageStore` trigger. Failures are now remembered in memory.
- A second suggestion click opened a second draft. Suggestions now hide when a draft exists.
- "(me)" matched a substring of the From header. It now matches the exact `<address>`.

Rejected after checking the code:
- XSS through the reply body. `textToHtml` escapes every line before `composeReply`.
- A summary showing on the wrong thread. Entries are keyed by thread id and shown only for a matching last message id.
- "Draft with AI" while requests are stopped. The button is hidden when the store is not available.
- `sendSyncMailNow` might not exist. It is the same call as the F5 command.

Won't fix:
- No server-side rate limit. There is one user per backend, the requests are behind the identity token, and the client dwell, cache and failure memory cap the cost.
- `replaceReplyText` with neither a signature nor a quote replaces the whole body. Reply drafts always carry the quote.
- A draft can bind to an older last message if a new one arrives while the request runs.
- More spec coverage for races.

## Validation

- **Backend:** `npm run build`. Then, against a scratch server with an empty key, `test/ai-reading.mjs` and `test/ai-triage.mjs` print ALL CHECKS PASSED, and email text never appears in the server log.
- **Client:** lint and typecheck pass. `npm test -- --spec-file-pattern='ai-triage|draft-store-reply-body|message-list|new-look'` gives 98 passing.
- **Dev app on Linux, New Look, against a local backend with the real key:**
  - The summary of a real thread was correct (3 points), with 3 sensible suggestions.
  - "Draft with AI" greeted the sender by name and kept the signature and the quote.
  - Shorter and More formal swapped the text and kept both. Paragraphs have one blank line.
  - Discard removed the draft.
  - The refresh button triggers one sync wake.

## Notes

- **Privacy:** when this is on, the text of every opened conversation (up to 8 messages, without quotes) goes to the backend and OpenRouter, with `provider.data_collection: deny`. The preference text says so.
- **Not built yet:** the Ask box and "Your day".
- Not checked on macOS or Windows.
