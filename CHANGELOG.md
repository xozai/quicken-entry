# Quicken Entry Changelog

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
