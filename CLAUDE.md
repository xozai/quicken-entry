# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A [Raycast](https://raycast.com) extension for macOS that automates entering financial transactions into Quicken via AppleScript UI automation. Users can enter transactions through a full form (`Add Transaction`) or natural language (`Quick Expense`).

## Commands

```bash
npm run dev       # Run extension in development mode (hot reload)
npm run build     # Build for production
npm run lint      # Lint code
npm run fix-lint  # Auto-fix linting issues
npm run publish   # Publish to Raycast store
```

No test framework is configured — this extension is manually tested in Raycast via `npm run dev`.

## Architecture

**Two Raycast commands** (each a separate React component):
- `src/add-transaction.tsx` — Full form with dropdowns, validation, and expense/income toggle (Cmd+T within the form)
- `src/quick-expense.tsx` — Natural language parser (e.g., `$45 Starbucks :Food`, `+45 Paycheck :Income`)

**Core utilities:**
- `src/utils/applescript.ts` — The integration layer. Writes scripts to temp files (for security, avoiding injection), then uses macOS accessibility APIs to automate Quicken's UI: activate app → select account in sidebar → Cmd+N for new transaction → Tab through fields → submit. Field order: Date → Num/Ref → Payee → Category → Tag → Memo → Payment → Deposit. The Tag field Tab keystroke (line ~109) may need to be removed for Quicken versions without a Tag column.
- `src/utils/storage.ts` — Persists recent payees/categories using Raycast's `LocalStorage` API (max 25 items each, de-duplicated, most-recent-first). Exports `mergeUnique` used by `add-transaction.tsx` to combine recent categories with configured ones for the dropdown. Recent payees are stored but not surfaced in a UI dropdown — they're recorded after each submission for potential future use.

**Exported pure functions:**
- `parseQuickExpense(raw: string): ParsedExpense | null` in `quick-expense.tsx` — parses natural language input; can be imported independently for testing or reuse.

**User preferences** (declared in `package.json` under `preferences`):
- `defaultAccount` (required) — default account for both commands (Quick Expense uses it automatically; Add Transaction pre-selects it)
- `accounts` (required) — comma-separated list powering the account dropdown; names must match Quicken's sidebar labels exactly (the AppleScript does a `contains` match)
- `categories` (optional) — comma-separated suggestions merged with recents in the category dropdown
- `bringToForeground` (checkbox) — whether Quicken stays in front after entry

## Key Implementation Notes

- AppleScript parameters are passed via `argv` to temp files, never interpolated into script strings — this is intentional for security.
- The AppleScript includes `delay` calls tuned for Quicken's UI responsiveness; be cautious when modifying timing.
- `raycast-env.d.ts` is auto-generated — do not edit manually.
- The extension targets Quicken for Mac only; it checks for Quicken installation and accessibility permissions before running.
