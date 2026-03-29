# Quicken Entry Changelog

## [1.1.0] - 2026-03-28

### Added

- **`skipTagField` preference** — checkbox (default: on) that sends an extra Tab to skip Quicken's Tag column; disable if your register has no Tag column to prevent field values from landing in the wrong columns
- **`uiDelay` preference** — Automation Speed dropdown (Fast / Normal / Slow) that scales all inter-field delays; use Slow on older or busier Macs where transactions are entered incorrectly
- **Account mismatch guard** — both commands now show a clear error screen (not a silent failure) when `defaultAccount` is not present in the `accounts` list, with a direct link to Preferences
- **Sidebar navigation warning** — if AppleScript cannot find the account in Quicken's sidebar, a toast is shown identifying the account name and suggesting a spelling check; the transaction is still saved rather than discarded
- **Parser: payee-first order** — Quick Expense now accepts `Starbucks $45` and `Trader Joe's 87.43` in addition to the original amount-first format
- **Parser: comma-formatted amounts** — `$1,234.56 Rent` and `1,200 Car payment` now parse correctly
- **Parser: `@Account` suffix** — append `@Visa` (or any account name) to override the default account inline, e.g. `$45 Starbucks :Food @Visa`
- **Smarter parse-failure hints** — the preview area shows a specific suggestion (reversed order, comma in amount, missing space before colon) instead of a generic error string
- **Fallback Command support** — Quick Expense registers a text argument so it can be invoked directly from Raycast root search; a parseable argument auto-submits after 100 ms

### Changed

- All AppleScript delays are now computed from a single `delayBase` value derived from the new `uiDelay` preference (previously hardcoded)
- `enterTransaction()` now reads and passes `skipTagField` and `uiDelay` to the AppleScript as positional args 9 and 10 (backward-compatible addition)
- Format hint in Quick Expense updated to include the `@Account` override syntax

## [1.0.0] - 2026-03-27

### Added

- **Add Transaction** command — full form with account dropdown, date, payee, category, amount, and memo fields
- **Quick Expense** command — natural language entry (e.g. `$45 Starbucks :Food & Dining`) with live parse preview
- Expense / Income toggle via `⌘T` in Add Transaction
- Recent payee and category memory via Raycast `LocalStorage` (up to 25 items each, most-recent-first)
- Accessibility permission guard with step-by-step instructions and a direct link to System Settings
- Quicken installation detection with a clear error screen if the app is not found
- AppleScript UI automation using argv-based temp files (injection-safe) to drive Quicken's register
- Four extension preferences: Default Account, Accounts list, Categories list, and Bring to Foreground toggle
