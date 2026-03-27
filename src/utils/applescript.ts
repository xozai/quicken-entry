import { execFile, execFileSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getPreferenceValues } from "@raycast/api";

export interface Transaction {
  account: string;
  date: string; // MM/DD/YYYY
  payee: string;
  category: string;
  amount: number;
  isExpense: boolean;
  memo?: string;
}

interface Preferences {
  bringToForeground: boolean;
}

// ---------------------------------------------------------------------------
// AppleScript: uses System Events UI scripting to enter a transaction.
//
// Field tab order in Quicken Mac register (2024+ subscription):
//   Date → Num/Ref → Payee → Category → Tag → Memo → Payment → Deposit
//
// If your version of Quicken has a different field order, adjust the Tab
// keystrokes in the "Fill fields" section below.
// ---------------------------------------------------------------------------
const ENTER_TRANSACTION_SCRIPT = `
on run argv
  set acctName   to item 1 of argv
  set txDate     to item 2 of argv
  set txPayee    to item 3 of argv
  set txCategory to item 4 of argv
  set txMemo     to item 5 of argv
  set txAmount   to item 6 of argv
  set txType     to item 7 of argv  -- "expense" or "income"
  set bringFwd   to item 8 of argv  -- "true" or "false"

  -- ── Launch / activate Quicken ─────────────────────────────────────────────
  if application "Quicken" is not running then
    tell application "Quicken" to activate
    delay 3
  else
    tell application "Quicken" to activate
    delay 1
  end if

  tell application "System Events"
    tell process "Quicken"
      set frontmost to true
      delay 0.5

      -- ── Select account in sidebar (best-effort) ───────────────────────────
      -- Quicken's sidebar is a source list inside a splitter. We walk all rows
      -- and click the first one whose label contains the account name.
      try
        set theWindow  to window 1
        set theSplitter to splitter group 1 of theWindow
        -- Sidebar is typically scroll area 1 of the splitter
        set theSidebar to scroll area 1 of theSplitter
        set allItems   to entire contents of theSidebar
        repeat with anItem in allItems
          if class of anItem is row then
            try
              if value of static text 1 of anItem contains acctName then
                click anItem
                delay 0.6
                exit repeat
              end if
            end try
          end if
        end repeat
      end try

      -- ── Open a new transaction (Cmd+N) ────────────────────────────────────
      keystroke "n" using command down
      delay 0.8

      -- ── Fill fields ───────────────────────────────────────────────────────
      -- Date (field 1): clear existing value, type the new date
      keystroke "a" using command down
      keystroke txDate
      key code 48  -- Tab → Num/Ref field
      delay 0.15

      -- Num/Ref (field 2): leave blank, skip
      key code 48  -- Tab → Payee
      delay 0.15

      -- Payee (field 3)
      keystroke "a" using command down
      keystroke txPayee
      key code 48  -- Tab → Category
      delay 0.3    -- extra delay; Quicken may show an autocomplete popup

      -- Category (field 4): type, then Escape to dismiss any dropdown
      keystroke "a" using command down
      keystroke txCategory
      delay 0.4
      key code 53  -- Escape → close autocomplete popup without selecting
      delay 0.1
      key code 48  -- Tab → Tag (or Memo if no Tag column)
      delay 0.15

      -- Tag (field 5, present in some versions): leave blank, skip
      -- Comment out the next line if your register has no Tag column:
      key code 48  -- Tab → Memo
      delay 0.15

      -- Memo (field 6)
      keystroke txMemo
      key code 48  -- Tab → Payment
      delay 0.15

      -- Payment / Deposit (fields 7 & 8)
      if txType is "expense" then
        -- Payment field
        keystroke "a" using command down
        keystroke txAmount
        key code 48  -- Tab past Payment
        key code 48  -- Tab past Deposit
      else
        -- Skip Payment, fill Deposit
        key code 48  -- Tab past Payment
        keystroke "a" using command down
        keystroke txAmount
        key code 48  -- Tab past Deposit
      end if
      delay 0.15

      -- ── Save the transaction ──────────────────────────────────────────────
      key code 36  -- Return
      delay 0.4

    end tell
  end tell

  -- ── Optionally push Quicken to the background ─────────────────────────────
  if bringFwd is "false" then
    tell application "Finder" to activate
  end if

end run
`;

// ---------------------------------------------------------------------------
// Check whether Raycast has Accessibility / System Events permission.
// Returns true if accessible, false if blocked.
// ---------------------------------------------------------------------------
export function checkAccessibilityPermissions(): boolean {
  try {
    execFileSync(
      "osascript",
      [
        "-e",
        'tell application "System Events" to return name of first process whose frontmost is true',
      ],
      { timeout: 5000 },
    );
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Check whether Quicken is installed on this Mac.
// ---------------------------------------------------------------------------
export function isQuickenInstalled(): boolean {
  try {
    const result = execFileSync(
      "mdfind",
      ["kMDItemCFBundleIdentifier == 'com.quicken.Quicken'"],
      { timeout: 5000 },
    )
      .toString()
      .trim();
    return result.length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Write the AppleScript to a temp file and execute it with osascript,
// passing each transaction field as a separate argv element (no injection risk).
// ---------------------------------------------------------------------------
export function enterTransaction(transaction: Transaction): Promise<void> {
  const { bringToForeground } = getPreferenceValues<Preferences>();

  return new Promise((resolve, reject) => {
    const tmpFile = join(tmpdir(), `quicken-tx-${Date.now()}.scpt`);

    try {
      writeFileSync(tmpFile, ENTER_TRANSACTION_SCRIPT, "utf8");
    } catch (err) {
      reject(new Error(`Could not write temp AppleScript: ${err}`));
      return;
    }

    execFile(
      "osascript",
      [
        tmpFile,
        transaction.account,
        transaction.date,
        transaction.payee,
        transaction.category,
        transaction.memo ?? "",
        transaction.amount.toFixed(2),
        transaction.isExpense ? "expense" : "income",
        bringToForeground ? "true" : "false",
      ],
      { timeout: 30_000 },
      (err, _stdout, stderr) => {
        try {
          unlinkSync(tmpFile);
        } catch {
          /* ignore cleanup errors */
        }

        if (err) {
          const msg = stderr?.trim() || err.message;
          // Surface a friendly message for the most common failure
          if (msg.includes("not allowed assistive") || msg.includes("1002")) {
            reject(
              new Error(
                "Accessibility access is not enabled for Raycast.\n\n" +
                  "Open System Settings → Privacy & Security → Accessibility\n" +
                  "and enable the toggle next to Raycast.",
              ),
            );
          } else if (msg.includes("Can't get process")) {
            reject(
              new Error(
                "Quicken does not appear to be running and could not be launched.\n" +
                  "Check that Quicken is installed at /Applications/Quicken.app.",
              ),
            );
          } else {
            reject(new Error(msg || "Unknown AppleScript error"));
          }
        } else {
          resolve();
        }
      },
    );
  });
}
