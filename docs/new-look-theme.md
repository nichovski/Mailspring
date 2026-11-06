# New Look themes

**Date:** November 6, 2026 · **Branch:** `feat/new-look` (`82affc88f`…`d0b5d407c`)

## What it does

Two themes, **New Look** (light) and **New Look Dark**, make Mailspring look like the approved redesign. Pick them in Preferences → Appearance, or as the light and dark choices under Automatic. They are not the default yet.

With a New Look theme on:

- Geist for the UI and Newsreader for the message subject. Both are bundled (woff2, OFL) and load offline from `mailspring://ui-new-look/fonts/`.
- The sidebar gets a brand row and a full-width **Compose** button with the shortcut hint ("C" in the Gmail keymap). The toolbar Compose is hidden.
- Narrow thread rows are 120px: a 36px initials avatar, an unread dot, sender and time on one line (time in accent when unread), the subject, a 2-line preview (1 line when the row has chips), a chips row, and the star bottom-right. The selected row is tinted, not inverted.
- Reading pane: 30px serif subject, messages in rounded cards, email body in Geist 15px (HTML and plain-text mail).
- 46px flat toolbar on all platforms. The canvas is 61px, but Mailspring hard-codes 34px in the selection bar, window title and search bar; 46px reuses the proven macOS geometry.

In every theme, Smart Triage changed shape: the attention meter sits just before the time, the spam chip is a pill, and the Smart triage card and the spam warning follow the canvas. Colours come from the active theme.

## Why

The canvas design is a full redesign. Phase 1 (Smart Triage, `docs/smart-triage.md`) only added triage parts to the stock look, so the app still looked like old Mailspring. This makes the app match the canvas without touching the stock themes.

Decisions made with Bogdan:

- **Not the default yet.** It ships as a choice; making it the default is a small follow-up after he has used it.
- **Triage restyle applies in every theme**, in that theme's colours.
- **46px toolbar** for now.
- **The spam warning says only "AI flagged this message."** The canvas line "Links and images stay blocked until you mark it as not spam" is dropped, because nothing blocks them.

## How it works

Three new packages:

- `app/internal_packages/ui-new-look/` (theme). `styles/` holds three top-level files: `ui-variables.less` (light tokens), `look.less` and `email-frame.less`. All rules, the token-to-variable map and the font faces live in `styles/shared/`. Subfolders are not auto-loaded, so the shared files load only through those imports.
- `app/internal_packages/ui-new-look-dark/` (theme). Its own `ui-variables.less` with dark tokens, then the light package's `shared/` files by relative path, plus the dark-only icon inversions copied from `ui-dark`.
- `app/internal_packages/new-look/` (normal package). It registers the sidebar header (brand + Compose) and the thread avatar only while a New Look theme is active, following `AppEnv.themes.onDidChangeActiveThemes`.

Non-obvious choices:

- **Two theme packages, not one with `prefers-color-scheme`.** Base variables go through LESS colour functions at compile time, so CSS variables can't stand in, and Automatic mode needs one package per mode.
- **Shared files never `@import 'ui-variables'`.** LESS looks next to the importing file first, so the dark theme would pick up the light variables. Each top-level file imports its own `ui-variables` first.
- **No `index.less`.** With one, only that file loads, and the email frame copies only sheets whose path contains `email-frame.less`.
- **The layout parts are not in the theme's `main`.** A theme's `main` runs inside the AppEnv constructor, before registries exist, so the components live in the separate `new-look` package.
- **Rules are scoped in `:is(body.theme-ui-new-look, body.theme-ui-new-look-dark)`.** The extra specificity beats platform rules such as `body.platform-linux .sheet-toolbar .btn-toolbar` without `!important`.
- **New thread-list slots.** `thread-list-columns.tsx` gained `ThreadListAvatar` (narrow only) and `ThreadListBeforeTimestamp` (narrow and wide). Empty slots render nothing visible, so stock themes look as before. The meter moved to `ThreadListBeforeTimestamp`; the chip stays at `Thread:MailLabel`.
- **`ThreadList` re-renders on theme change.** Row heights come from theme CSS (`--thread-list-item-height-narrow`), and `shouldComponentUpdate` otherwise blocks the re-read, so switching back to Light would keep 120px rows.
- **Five `@ai-triage-*` variables in `base/ui-variables.less`**, so the triage styles have colours in every theme; the New Look themes set the exact canvas tokens.
- **The avatar** shows the latest incoming sender (or, for sent mail, the first other participant) as initials on `hsl(Utils.hueForString(email), 50%, 45%)`, the same colour rule as `ContactProfilePhoto`, with no network request.

## Review

Two reviewers (GLM-5.3 Flash, DeepSeek V4 Flash) on the diff without the font files.

- Fixed: label pills touched in wide rows. The label margins were removed in all layouts, but the gap that replaces them applied only to narrow rows.
- Won't fix: "the narrow subject has no unread weight". The base rule already gives 400 read and 600 unread, as measured in the app.
- Already handled: the extra spacing after the spam chip (the theme removes the chip margin in the list).

Found in the app check and fixed: plain-text mail rendered in the monospace fallback (the base frame styles set `#inbox-plain-wrapper` to monospace), and the triage card's chevron collapsed to zero width so its 180° turn pivoted on its edge.

## Validation

- `npm run lint:check`, `npm run typecheck`: pass. `npm test -- --spec-file-pattern='ai-triage|thread-list|theme-picker'`: 44 passing. All theme and ai-triage LESS compiles under ui-light, New Look and New Look Dark.
- In the dev app on Linux, 1440×900, against the canvas: light and dark sidebar, narrow and wide rows, Smart triage card, spam warning and reading pane; Geist loaded from the bundled file. Switching live to stock Light left no trace: Nylas-Pro, 34px toolbar, Compose back in the toolbar, no avatars or brand, no New Look sheets.

## Notes

- Not checked on macOS or Windows.
- Known differences from the canvas (phase 2): the account switcher redesign (Compose sits above it), per-label chip colours (label pills keep their colours, and on the selected row the base `!important` keeps a faint background), the All/Unread switch, the message count pill, Your day, Ask, Summary, suggested replies.
- The thread list switches to wide rows when its column is wide; the canvas only shows the narrow layout.
- `INTERNAL_THEME_ORDER` in the theme picker does not list the new themes, so they sort with community themes.
