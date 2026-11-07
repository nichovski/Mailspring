# Ask and Your day

**Date:** November 7, 2026 · **Branch:** `feat/ai-ask` · **Backend:** `mailspring-backend` `feat/ai-ask`

## What it does

- **Your day**: a card in the New Look sidebar, under Compose. It needs Smart Triage on.
  - It shows a 2-3 sentence brief of what needs you today, for example: "16 conversations need you. Peter needs the contract signed before Tuesday…"
  - It shows the time the brief was made, and a "Show what needs me" button that opens Priority.
  - It is made once a day, on the first check after 06:00. When nothing needs you, it says "Nothing needs you right now." and makes no AI call.
  - An arrow next to the time hides the brief, leaving only the header, and shows it again. The choice is saved in `ai-triage.dayCollapsed`. It is an icon, not the word "Hide", because the sidebar has no room for a word next to the time. In a very narrow sidebar only the title shortens.
- **Ask**: type a question in the search bar and click the **Ask** badge inside it. It needs Summaries and replies on, and works in every theme.
  - The AI turns the question into a normal Mailspring search, so the thread list shows the matches.
  - An **Answer** card above the list gives a 1-3 sentence answer from the matches, the "Searched for" pills, and Clear (which goes back to the view you came from).
  - Enter still runs a plain search with no AI.
  - The placeholder becomes "Search, or ask about your mail".

## Why

These are the last AI parts of the redesign canvas. They reuse the OpenRouter setup of the summaries (`docs/ai-summaries-and-replies.md`): the key on the self-hosted backend, the model `deepseek/deepseek-v4.1-flash-1017` (`AI_ASK_MODEL`), strict JSON and reasoning off.

## How it works

- **Your day** (`day-store.ts`, `day-card.tsx`, `assistant-logic.ts` `pickDay`):
  - **Candidates:** the newest 200 inbox threads (the triage scorer's window) that are unread or less than 24 h old.
  - **Waits for scoring:** no call until every candidate has a triage entry.
  - **"Needs you":** not spam and attention ≥ 0.75, the meter's High level.
  - **What is sent:** the needs and spam counts plus the top 8 threads (sender, subject, date, 400-character snippet) to `POST /api/ai/day`.
  - **One attempt per day period** (periods start at 06:00 local). The brief is saved to `<configDir>/ai-day.json`, so restarting the same day makes no new call.
  - **Checks:** on mount and every 5 minutes, with a guard so the two cannot overlap.
  - **Placement:** the card fills a `NewLookSidebar:Day` slot in the New Look sidebar header, so stock themes never show it.
- **Ask** (`ask-store.ts`, `ask-card.tsx`):
  1. `POST /api/ai/ask/search` gets only the question and today's date. It returns structured filters (from, to, subject, words, since, before, unread, attachment), not search syntax.
  2. The client cleans the values:
     - quotes and backslashes are removed;
     - repeated values are dropped;
     - reserved words such as `to` or `or` are dropped, because the parser would read them as keywords;
     - each value is quoted.
     It then builds the query, for example `from:"Peter" "contract"`. Date ranges carry an explicit `00:00`, because chrono reads a bare date as noon.
  3. `Actions.searchQuerySubmitted(query)` runs the normal search view. `SearchStore` remembers the previous view, for Clear.
  4. The same query runs locally (`NOT (in:trash OR in:spam)`, newest 8). With no matches the card says "No matching mail found." with no second call. Otherwise the question plus the 8 snippets go to `POST /api/ai/ask/answer`.
  - The ask is dropped when the focused view stops being its search, and late results are ignored. Filters are cached in memory per day and question; answers are not cached.
  - The badge fills a `ThreadSearchBar:Ask` slot that ai-triage fills while `ai-triage.reading` is on.

## Decisions

- **The model returns filters, not search syntax.** This avoids parse errors and operators such as `in:trash` that the user never asked for.
- **The search field shows the query that ran, not the question.** This differs from the canvas. It is honest, you can edit it, and it needed no change to `SearchStore`. The pills give the friendly version.
- **Ask only on a click**, never on Enter, so there are no surprise paid calls.
- **No "Try asking" chips.** Static examples are not about your mail, and generated ones would cost an AI call for every view.
- **No label filter.** The model doesn't know your labels and would guess wrong.
- **"Needs you" uses attention ≥ 0.75, not 0.4.** In the live check on a 22-account inbox, 0.4 counted 126 conversations and 0.75 counted 16. The brief's first number has to mean something.
- **Snippets only**, never full bodies, for Ask and for Your day.

## Review

GLM-5.3 Flash and DeepSeek V4 Flash reviewed both repos.

Fixed:
- A value ending in a backslash would escape the closing quote. Backslashes are now removed.
- Repeated values made duplicate pills.
- Two Your day checks could overlap while the inbox query ran.
- The brief is now announced to screen readers (`aria-live`).
- The search reply limit went from 300 to 400 tokens, so its JSON is not cut off.

Rejected after checking the code:
- "Query injection via brackets and OR". Every value is quoted, so they stay plain text.
- "Unbounded Your day retries". The attempt is recorded before the request, so there is one per period.
- Listener "leaks" on singleton stores.

Won't fix:
- No server-side rate limit (one user per backend).
- `today` with an impossible date is only pattern-checked.

## Validation

- **Backend:** build, then on a scratch server with an empty key, `test/ai-ask.mjs`, `test/ai-reading.mjs` (after the `complete()` refactor) and the other harnesses print ALL CHECKS PASSED, and no email text appears in the log.
- **Client:** lint and typecheck pass. `npm test -- --spec-file-pattern='ai-triage|thread-search|new-look'` gives 154 passing.
- **Dev app, New Look, local backend with the real key:**
  - **Your day:** a correct brief with names and deadlines. After a reload the saved brief was used with no new call. The card fits the narrow sidebar.
  - **Real question:** "What does Peter need from me about the contract?" built `from:"Peter" "contract"`, listed the matches, and gave a correct answer.
  - **Real button:** the badge worked with typed text, including a date range.
  - **No answer in the mail:** a made-up question got an honest "None of these messages mention…".
  - **Clear:** went back to Inbox.

## Notes

- The model can read "this week" too wide (Nov 2 to 15 for a Saturday). The range is visible in the pills and in the query.
- Server-side search results that arrive later join the list, but the answer uses only the newest 8 local matches.
- Not checked on macOS or Windows.
