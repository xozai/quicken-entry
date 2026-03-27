# Quicken Entry

<p align="center">
  <img src="assets/extension-icon.png" width="128" alt="Quicken Entry icon" />
</p>

<p align="center">
  A <a href="https://raycast.com">Raycast</a> extension for macOS that lets you enter Quicken transactions without leaving your keyboard.
</p>

---

## Features

- **Add Transaction** — full form with account dropdown, date, payee, category, amount, and memo
- **Quick Expense** — natural language entry (`$45 Starbucks :Food`) with a live parse preview
- **Expense / Income toggle** — press `⌘T` inside Add Transaction to switch between payment and deposit
- **Recent memory** — payees and categories are remembered across sessions and surfaced automatically
- **Accessibility guard** — friendly onboarding screen if Raycast doesn't have the required macOS permission
- No Quicken API, no cloud — pure UI automation via AppleScript

---

## Requirements

| Requirement | Notes |
|---|---|
| **Quicken for Mac** | Subscription version (2024+) |
| **Raycast** | [raycast.com](https://raycast.com) |
| **macOS Accessibility** | Raycast must be enabled under System Settings → Privacy & Security → Accessibility |

---

## Installation

This extension is not yet in the Raycast Store. To sideload it:

```bash
git clone https://github.com/xozai/quicken-entry.git
cd quicken-entry
npm install
npm run dev
```

`npm run dev` registers the extension with your local Raycast instance and enables hot reload. The extension icon (`assets/extension-icon.png`) is already included.

---

## Setup

Open Raycast, search for either command, and press `⌘,` to open Extension Preferences.

| Preference | Required | Description | Example |
|---|---|---|---|
| **Default Account** | Yes | Account used by Quick Expense and pre-selected in Add Transaction | `Checking` |
| **Accounts** | Yes | Comma-separated list of your Quicken account names — must match the sidebar labels exactly | `Checking, Savings, Visa, Amex` |
| **Categories** | No | Comma-separated list of categories shown in the Add Transaction dropdown | `Food & Dining, Gas & Fuel, Shopping` |
| **Bring Quicken to Foreground** | No | When off (default), Quicken stays hidden after saving a transaction | _(checkbox)_ |

> **Account name matching:** The AppleScript finds accounts using a `contains` match, so `Visa` will match `Visa Signature`. Use the most specific name if you have similarly-named accounts.

---

## Usage

### Add Transaction

Open Raycast → **Add Transaction**. Fill in the form:

- Use the **Account** dropdown to pick a register
- **Date** defaults to today in `MM/DD/YYYY` format
- **Payee** is free text
- **Category** is a dropdown built from your preferences and recent usage
- Press `⌘T` to toggle between **Expense** (Payment) and **Income** (Deposit)
- **Memo** is optional

Press `↵` to submit. Quicken will activate, navigate to the selected account, and enter the transaction.

---

### Quick Expense

Open Raycast → **Quick Expense**. Type a transaction in natural language and press `↵`.

**Format:** `[$][+|-]<amount> <Payee> [:<Category>]`

| Input | Result |
|---|---|
| `$45 Starbucks` | $45.00 expense, no category |
| `$12.99 Netflix :Subscriptions` | $12.99 expense, category Subscriptions |
| `85 Trader Joes :Food & Dining` | $85.00 expense, category Food & Dining |
| `+2000 Paycheck :Income` | $2000.00 income (deposit) |
| `-34.50 Amazon :Shopping` | $34.50 expense (explicit minus) |

A live preview appears below the input field as you type. The transaction is posted to your **Default Account** with today's date.

---

## How It Works

There is no public API for Quicken on Mac, so the extension drives Quicken's UI directly using **macOS Accessibility APIs** (`System Events` via `osascript`).

When you submit a transaction:

1. Quicken is activated (or launched if not running)
2. The extension attempts to click your account in the sidebar by name
3. `⌘N` opens a new transaction row
4. The script tabs through fields in this order, filling each one:

```
Date → Num/Ref → Payee → Category → Tag → Memo → Payment → Deposit
```

5. `↵` saves the transaction
6. If **Bring to Foreground** is off, Finder is re-activated to push Quicken back

**AppleScript parameters are passed as `argv` to a temp file** — values are never interpolated into the script string, which prevents injection issues with special characters in payee names or memos.

> **Tag field note:** Some older Quicken versions don't have a Tag column in the register. If transactions are saving with fields shifted by one, comment out the Tag `key code 48` line in `src/utils/applescript.ts` around line 109.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| _"Accessibility access is not enabled"_ | Raycast not in the Accessibility list | System Settings → Privacy & Security → Accessibility → enable Raycast |
| _"Quicken does not appear to be running"_ | Quicken not installed at `/Applications/Quicken.app` | Reinstall Quicken or launch it manually first |
| Fields save into the wrong columns | Your Quicken version has a different field order | Adjust the Tab keystrokes in `src/utils/applescript.ts` to match your register layout |
| Category saves blank or with wrong value | Quicken's autocomplete dropdown intercepted the Tab | Increase the `delay` after the Category `keystroke` call in `applescript.ts` |
| Sidebar account not found | Account name in preferences doesn't match Quicken's label | Check for extra spaces or special characters; the match is case-sensitive `contains` |

---

## Contributing

Pull requests are welcome. Run `npm run lint` before submitting to check for issues, and `npm run fix-lint` to auto-fix most of them. The AppleScript in `src/utils/applescript.ts` is the most brittle part of the extension — if you're testing against a different Quicken version, noting the field order and any timing adjustments in the PR description is especially helpful.

---

## License

MIT — see [LICENSE](LICENSE) for details.
