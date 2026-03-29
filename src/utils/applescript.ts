import { execFile, execFileSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getPreferenceValues, showToast, Toast } from "@raycast/api";

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
  skipTagField: boolean;
  uiDelay: "fast" | "normal" | "slow";
}

const UI_DELAY_MAP: Record<string, number> = {
  fast: 0.15,
  normal: 0.3,
  slow: 0.6,
};

// ---------------------------------------------------------------------------
// AppleScript: uses System Events UI scripting to enter a transaction.
//
// Field tab order in Quicken Mac register (2024+ subscription):
//   Date → Num/Ref → Payee → Category → Tag → Memo → Payment → Deposit
//
// Args (positional):
//   1  acctName    2  txDate    3  txPayee    4  txCategory
//   5  txMemo      6  txAmount  7  txType     8  bringFwd
//   9  skipTag     10 delayBase
//
// Returns a status string on stdout:
//   "ok:<acctName>"         sidebar click succeeded
//   "warn:no_account_match" no sidebar row matched the account name
//   "warn:no_sidebar"       splitter/scroll area not found
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
  set skipTag    to item 9 of argv  -- "true" or "false"
  set delayBase  to (item 10 of argv) as number

  set d1 to delayBase        -- standard inter-field delay
  set d2 to delayBase * 2    -- after Payee (autocomplete may appear)
  set d3 to delayBase * 1.5  -- after Category escape

  set sidebarResult to "ok:" & acctName

  -- ── Launch / activate Quicken ─────────────────────────────────────────────
  if application "Quicken" is not running then
    tell application "Quicken" to activate
    delay 3
  else
    tell application "Quicken" to activate
    delay d1
  end if

  tell application "System Events"
    tell process "Quicken"
      set frontmost to true
      delay d1

      -- ── Select account in sidebar ──────────────────────────────────────────
      set sidebarOK to false
      try
        set theWindow   to window 1
        set theSplitter to splitter group 1 of theWindow
        set theSidebar  to scroll area 1 of theSplitter
        set allItems    to entire contents of theSidebar
        repeat with anItem in allItems
          if class of anItem is row then
            try
              if value of static text 1 of anItem contains acctName then
                click anItem
                delay d2
                set sidebarOK to true
                exit repeat
              end if
            end try
          end if
        end repeat
        if not sidebarOK then
          set sidebarResult to "warn:no_account_match"
        end if
      on error
        set sidebarResult to "warn:no_sidebar"
      end try

      -- ── Open a new transaction (Cmd+N) ────────────────────────────────────
      keystroke "n" using command down
      delay d1 * 2.5

      -- ── Date (field 1) ────────────────────────────────────────────────────
      keystroke "a" using command down
      keystroke txDate
      key code 48  -- Tab → Num/Ref
      delay d1

      -- ── Num/Ref (field 2): leave blank, skip ─────────────────────────────
      key code 48  -- Tab → Payee
      delay d1

      -- ── Payee (field 3) ───────────────────────────────────────────────────
      keystroke "a" using command down
      keystroke txPayee
      key code 48  -- Tab → Category
      delay d2     -- extra; Quicken may show autocomplete popup

      -- ── Category (field 4) ───────────────────────────────────────────────
      keystroke "a" using command down
      keystroke txCategory
      delay d3
      key code 53  -- Escape (dismiss autocomplete)
      delay d1
      key code 48  -- Tab → Tag (or Memo if no Tag column)
      delay d1

      -- ── Tag (field 5): skip only when the column is present ──────────────
      if skipTag is "true" then
        key code 48  -- Tab → Memo
        delay d1
      end if

      -- ── Memo ──────────────────────────────────────────────────────────────
      keystroke txMemo
      key code 48  -- Tab → Payment
      delay d1

      -- ── Payment / Deposit ─────────────────────────────────────────────────
      if txType is "expense" then
        keystroke "a" using command down
        keystroke txAmount
        key code 48  -- Tab past Payment
        key code 48  -- Tab past Deposit
      else
        key code 48  -- Tab past Payment
        keystroke "a" using command down
        keystroke txAmount
        key code 48  -- Tab past Deposit
      end if
      delay d1

      -- ── Save ──────────────────────────────────────────────────────────────
      key code 36  -- Return
      delay d1

    end tell
  end tell

  -- ── Optionally push Quicken to the background ─────────────────────────────
  if bringFwd is "false" then
    tell application "Finder" to activate
  end if

  return sidebarResult

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
// Resolves when the transaction is saved. If the sidebar account-click failed,
// a warning toast is shown but the promise still resolves (the transaction was
// entered — just possibly in the wrong account).
// ---------------------------------------------------------------------------
export function enterTransaction(transaction: Transaction): Promise<void> {
  const { bringToForeground, skipTagField, uiDelay } =
    getPreferenceValues<Preferences>();
  const delayBase = UI_DELAY_MAP[uiDelay] ?? 0.3;

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
        skipTagField ? "true" : "false",
        delayBase.toFixed(2),
      ],
      { timeout: 30_000 },
      (err, stdout, stderr) => {
        try {
          unlinkSync(tmpFile);
        } catch {
          /* ignore cleanup errors */
        }

        if (err) {
          const msg = stderr?.trim() || err.message;
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
          return;
        }

        // Check sidebar status — warn but still resolve
        const status = stdout?.trim() ?? "";
        if (status.startsWith("warn:")) {
          const message =
            status === "warn:no_account_match"
              ? `"${transaction.account}" was not found in Quicken's sidebar. The transaction may be in the wrong account — check the Accounts preference for a spelling mismatch.`
              : "Quicken's sidebar could not be accessed. The transaction may be in the wrong account.";
          showToast({
            style: Toast.Style.Failure,
            title: "Account navigation warning",
            message,
          });
        }

        resolve();
      },
    );
  });
}
