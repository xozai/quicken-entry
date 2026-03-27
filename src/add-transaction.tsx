import {
  Form,
  ActionPanel,
  Action,
  showToast,
  Toast,
  getPreferenceValues,
  openExtensionPreferences,
  Detail,
} from "@raycast/api";
import { useState, useEffect } from "react";
import { enterTransaction, checkAccessibilityPermissions, isQuickenInstalled } from "./utils/applescript";
import { getRecentCategories, addRecentPayee, addRecentCategory, mergeUnique } from "./utils/storage";

interface Preferences {
  defaultAccount: string;
  accounts: string;
  categories: string;
  bringToForeground: boolean;
}

interface FormValues {
  account: string;
  date: string;
  payee: string;
  category: string;
  amount: string;
  memo: string;
}

// ---------------------------------------------------------------------------
// Accessibility / installation guard — shown before the main form
// ---------------------------------------------------------------------------
function AccessibilityWarning({ reason }: { reason: "permissions" | "not-installed" }) {
  const md =
    reason === "not-installed"
      ? `# Quicken Not Found

Quicken does not appear to be installed on this Mac.

Install Quicken from [quicken.com](https://www.quicken.com) and relaunch this command.`
      : `# Accessibility Access Required

This extension uses macOS **Accessibility** APIs to control Quicken's UI.

**To enable:**

1. Open **System Settings** → **Privacy & Security** → **Accessibility**
2. Find **Raycast** in the list and toggle it **on**
3. Return here and try again

> If Raycast is not in the list, click **+**, navigate to \`/Applications/Raycast.app\`, and add it.`;

  return (
    <Detail
      markdown={md}
      actions={
        <ActionPanel>
          {reason === "permissions" && (
            <Action.Open
              title="Open Privacy & Security Settings"
              target="x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
            />
          )}
          <Action title="Open Extension Preferences" onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayFormatted(): string {
  const d = new Date();
  return [
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
    d.getFullYear(),
  ].join("/");
}

function isValidDate(s: string): boolean {
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s) && !isNaN(Date.parse(s));
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------
export default function AddTransaction() {
  const prefs = getPreferenceValues<Preferences>();

  // Guard: check installation + permissions once on mount
  const [ready, setReady] = useState<boolean | null>(null); // null = loading
  const [guardReason, setGuardReason] = useState<"permissions" | "not-installed" | null>(null);

  // Categories merged from recent usage + preferences
  const [allCategories, setAllCategories] = useState<string[]>([]);

  // Expense vs Income toggle
  const [isExpense, setIsExpense] = useState(true);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function init() {
      if (!isQuickenInstalled()) {
        setGuardReason("not-installed");
        setReady(false);
        return;
      }
      if (!checkAccessibilityPermissions()) {
        setGuardReason("permissions");
        setReady(false);
        return;
      }
      setReady(true);

      // Load recent categories and merge with configured ones
      const recent = await getRecentCategories();
      const configured = prefs.categories
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      setAllCategories(mergeUnique(recent, configured));
    }

    init();
  }, []);

  // ── Guard screens ──────────────────────────────────────────────────────────
  if (ready === null) return <Form isLoading />;
  if (!ready && guardReason) return <AccessibilityWarning reason={guardReason} />;

  const accounts = prefs.accounts
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(values: FormValues) {
    // Validate amount
    const amount = parseFloat(values.amount.replace(/^\$/, ""));
    if (isNaN(amount) || amount <= 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid amount",
        message: "Enter a positive number, e.g. 12.50",
      });
      return;
    }

    // Validate date
    if (!isValidDate(values.date)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid date",
        message: "Use MM/DD/YYYY format",
      });
      return;
    }

    if (!values.payee.trim()) {
      await showToast({ style: Toast.Style.Failure, title: "Payee is required" });
      return;
    }

    setIsSubmitting(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "Entering transaction in Quicken…" });

    try {
      await enterTransaction({
        account: values.account,
        date: values.date,
        payee: values.payee.trim(),
        category: values.category,
        amount,
        isExpense,
        memo: values.memo.trim(),
      });

      // Persist to recent lists
      await Promise.all([addRecentPayee(values.payee.trim()), addRecentCategory(values.category)]);

      toast.style = Toast.Style.Success;
      toast.title = "Transaction saved";
      toast.message = `${isExpense ? "−" : "+"}$${amount.toFixed(2)} · ${values.payee.trim()} → ${values.account}`;
    } catch (err: unknown) {
      toast.style = Toast.Style.Failure;
      toast.title = "Transaction failed";
      toast.message = err instanceof Error ? err.message : String(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <Form
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={`Save ${isExpense ? "Expense" : "Income"}`}
            onSubmit={handleSubmit}
          />
          <Action
            title={`Switch to ${isExpense ? "Income" : "Expense"}`}
            shortcut={{ modifiers: ["cmd"], key: "t" }}
            onAction={() => setIsExpense((e) => !e)}
          />
          <Action title="Open Extension Preferences" onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    >
      {/* Type badge */}
      <Form.Description
        title="Type"
        text={isExpense ? "💸 Expense   (⌘T to switch to Income)" : "💰 Income   (⌘T to switch to Expense)"}
      />

      <Form.Separator />

      {/* Account */}
      <Form.Dropdown id="account" title="Account" defaultValue={prefs.defaultAccount}>
        {accounts.map((acct) => (
          <Form.Dropdown.Item key={acct} value={acct} title={acct} />
        ))}
      </Form.Dropdown>

      {/* Date */}
      <Form.TextField id="date" title="Date" defaultValue={todayFormatted()} placeholder="MM/DD/YYYY" />

      {/* Payee */}
      <Form.TextField id="payee" title="Payee" placeholder="Who did you pay?" autoFocus />

      {/* Category */}
      <Form.Dropdown id="category" title="Category" defaultValue="">
        <Form.Dropdown.Item value="" title="— No Category —" />
        {allCategories.length > 0 && (
          <Form.Dropdown.Section title="Categories">
            {allCategories.map((cat) => (
              <Form.Dropdown.Item key={cat} value={cat} title={cat} />
            ))}
          </Form.Dropdown.Section>
        )}
      </Form.Dropdown>

      {/* Amount */}
      <Form.TextField
        id="amount"
        title={isExpense ? "Amount (Payment)" : "Amount (Deposit)"}
        placeholder="0.00"
      />

      {/* Memo */}
      <Form.TextField id="memo" title="Memo" placeholder="Optional note" />
    </Form>
  );
}
