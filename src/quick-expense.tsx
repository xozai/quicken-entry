import {
  Form,
  ActionPanel,
  Action,
  showToast,
  Toast,
  getPreferenceValues,
  openExtensionPreferences,
  Detail,
  LaunchProps,
} from "@raycast/api";
import { useState, useEffect, useRef } from "react";
import {
  enterTransaction,
  checkAccessibilityPermissions,
  isQuickenInstalled,
} from "./utils/applescript";
import { addRecentPayee, addRecentCategory } from "./utils/storage";

interface Preferences {
  defaultAccount: string;
  accounts: string;
  bringToForeground: boolean;
}

// ---------------------------------------------------------------------------
// Natural-language parser
//
// Supported formats (amount-first):
//   $45 Starbucks
//   $45.50 Starbucks :Food & Dining
//   45 Netflix :Subscriptions
//   +45 Paycheck :Income         (+ prefix = income)
//   -12 Lunch :Food              (- prefix = expense, explicit)
//   $1,234.56 Rent               (comma-formatted amounts)
//
// Supported formats (payee-first):
//   Starbucks $45
//   Trader Joe's 87.43
//   Starbucks $45 :Food
//   Netflix +45                  (income, payee-first)
//
// Account override (append to any format):
//   $45 Starbucks :Food @Visa
//   45 Netflix @Amex
// ---------------------------------------------------------------------------
export interface ParsedExpense {
  amount: number;
  payee: string;
  category: string;
  isExpense: boolean;
  account?: string;
}

export function parseQuickExpense(raw: string): ParsedExpense | null {
  const input = raw.trim();
  if (!input) return null;

  // Step 1: Extract @Account suffix — last whitespace-delimited token starting with @
  let account: string | undefined;
  let rest = input;
  const atMatch = input.match(/^(.*)\s+@(\S+)$/);
  if (atMatch) {
    rest = atMatch[1].trim();
    account = atMatch[2];
  }

  if (!rest) return null;

  // Step 2: Try amount-first (original pattern, extended for comma-formatted numbers)
  //   ^([+-]?)  \$?  (digits with optional commas + up to 2 decimals)  \s+  payee  optional :category
  const amountFirst = rest.match(
    /^([+-]?)\$?([\d,]+(?:\.\d{1,2})?)\s+(.+?)(?:\s+:(.+))?$/,
  );
  if (amountFirst) {
    const sign = amountFirst[1];
    const amount = parseFloat(amountFirst[2].replace(/,/g, ""));
    const payee = amountFirst[3].trim();
    const category = amountFirst[4]?.trim() ?? "";
    if (!isNaN(amount) && amount > 0 && payee) {
      return { amount, payee, category, isExpense: sign !== "+", account };
    }
  }

  // Step 3: Try payee-first
  //   payee (lazy)  \s+  optional sign/dollar  digits  optional :category
  const payeeFirst = rest.match(
    /^(.+?)\s+([+-]?\$?[\d,]+(?:\.\d{1,2})?)(?:\s+:(.+))?$/,
  );
  if (payeeFirst) {
    const rawAmount = payeeFirst[2];
    const signMatch = rawAmount.match(/^([+-])/);
    const sign = signMatch ? signMatch[1] : "";
    const amount = parseFloat(rawAmount.replace(/[+\-$,]/g, ""));
    const payee = payeeFirst[1].trim();
    const category = payeeFirst[3]?.trim() ?? "";
    if (!isNaN(amount) && amount > 0 && payee) {
      return { amount, payee, category, isExpense: sign !== "+", account };
    }
  }

  return null;
}

// Returns a specific hint when the parser fails, instead of a generic message.
export function diagnoseParseFailure(raw: string): string {
  const input = raw.replace(/\s+@\S+$/, "").trim();

  if (/^[a-zA-Z]/.test(input) && /\$?\d/.test(input)) {
    const firstWord = input.split(/\s+/)[0];
    return `Try putting the amount first: "$45 ${firstWord}"`;
  }
  if (/\d{1,3},\d{3}/.test(input)) {
    const fixed = input.replace(/(\d),(\d{3})/g, "$1$2");
    return `Remove commas from the amount: "${fixed}"`;
  }
  if (/:[^ ]/.test(input)) {
    return `Add a space before the colon: "… :Category"`;
  }
  return `Format: "$amount Payee [:Category] [@Account]"`;
}

function todayFormatted(): string {
  const d = new Date();
  return [
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
    d.getFullYear(),
  ].join("/");
}

function formatPreview(p: ParsedExpense, defaultAccount: string): string {
  const sign = p.isExpense ? "−" : "+";
  const cat = p.category ? ` · ${p.category}` : "";
  const acct = p.account ?? defaultAccount;
  return `**${sign}$${p.amount.toFixed(2)}**  ${p.payee}${cat}  →  ${acct}`;
}

// ---------------------------------------------------------------------------
// Config error guard
// ---------------------------------------------------------------------------
function AccountMismatchWarning({
  defaultAccount,
  accounts,
}: {
  defaultAccount: string;
  accounts: string[];
}) {
  const md = `# Account Mismatch

**Default Account** \`"${defaultAccount}"\` is not in your **Accounts** list.

Open **Extension Preferences** (⌘,) and either:
- Correct the **Default Account** spelling, or
- Add it to the **Accounts** list

Your Accounts list: \`${accounts.join(" · ")}\``;

  return (
    <Detail
      markdown={md}
      actions={
        <ActionPanel>
          <Action
            title="Open Extension Preferences"
            onAction={openExtensionPreferences}
          />
        </ActionPanel>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Accessibility / installation guard
// ---------------------------------------------------------------------------
function AccessibilityWarning({
  reason,
}: {
  reason: "permissions" | "not-installed";
}) {
  const md =
    reason === "not-installed"
      ? `# Quicken Not Found\n\nInstall Quicken from [quicken.com](https://www.quicken.com) and relaunch this command.`
      : `# Accessibility Access Required

Open **System Settings → Privacy & Security → Accessibility** and enable **Raycast**.`;

  return (
    <Detail
      markdown={md}
      actions={
        <ActionPanel>
          {reason === "permissions" && (
            <Action.Open
              title="Open Privacy & Security"
              target="x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
            />
          )}
          <Action
            title="Open Extension Preferences"
            onAction={openExtensionPreferences}
          />
        </ActionPanel>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------
export default function QuickExpense(
  props: LaunchProps<{ arguments: { fallbackText: string } }>,
) {
  const prefs = getPreferenceValues<Preferences>();
  const fallbackText = props.arguments.fallbackText ?? "";

  const [ready, setReady] = useState<boolean | null>(null);
  const [guardReason, setGuardReason] = useState<
    "permissions" | "not-installed" | null
  >(null);
  const [inputValue, setInputValue] = useState(fallbackText);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    if (!isQuickenInstalled()) {
      setGuardReason("not-installed");
      setReady(false);
    } else if (!checkAccessibilityPermissions()) {
      setGuardReason("permissions");
      setReady(false);
    } else {
      setReady(true);
    }
  }, []);

  // Auto-submit when launched via Fallback Command with a parseable argument
  useEffect(() => {
    if (ready !== true || !fallbackText || autoSubmittedRef.current) return;
    if (!parseQuickExpense(fallbackText)) return;
    autoSubmittedRef.current = true;
    const timer = setTimeout(() => handleSubmit({ input: fallbackText }), 100);
    return () => clearTimeout(timer);
  }, [ready]);

  if (ready === null) return <Form isLoading />;
  if (!ready && guardReason)
    return <AccessibilityWarning reason={guardReason} />;

  const accountList = prefs.accounts
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  if (!accountList.includes(prefs.defaultAccount.trim())) {
    return (
      <AccountMismatchWarning
        defaultAccount={prefs.defaultAccount.trim()}
        accounts={accountList}
      />
    );
  }

  const parsed = parseQuickExpense(inputValue);

  async function handleSubmit(values: { input: string }) {
    const p = parseQuickExpense(values.input);
    if (!p) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not parse",
        message: diagnoseParseFailure(values.input),
      });
      return;
    }

    setIsSubmitting(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Entering transaction in Quicken…",
    });

    try {
      await enterTransaction({
        account: p.account ?? prefs.defaultAccount,
        date: todayFormatted(),
        payee: p.payee,
        category: p.category,
        amount: p.amount,
        isExpense: p.isExpense,
        memo: "",
      });

      await Promise.all([
        addRecentPayee(p.payee),
        p.category ? addRecentCategory(p.category) : Promise.resolve(),
      ]);

      toast.style = Toast.Style.Success;
      toast.title = "Transaction saved";
      toast.message = `${p.isExpense ? "−" : "+"}$${p.amount.toFixed(2)} · ${p.payee} → ${p.account ?? prefs.defaultAccount}`;
    } catch (err: unknown) {
      toast.style = Toast.Style.Failure;
      toast.title = "Transaction failed";
      toast.message = err instanceof Error ? err.message : String(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Add to Quicken" onSubmit={handleSubmit} />
          <Action
            title="Open Extension Preferences"
            onAction={openExtensionPreferences}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="input"
        title="Transaction"
        placeholder="$45 Starbucks :Food & Dining"
        defaultValue={fallbackText}
        onChange={setInputValue}
        autoFocus
      />

      {/* Live preview */}
      {parsed ? (
        <Form.Description
          title="Preview"
          text={formatPreview(parsed, prefs.defaultAccount)}
        />
      ) : inputValue.length > 0 ? (
        <Form.Description
          title="Preview"
          text={`⚠️  ${diagnoseParseFailure(inputValue)}`}
        />
      ) : null}

      <Form.Separator />

      <Form.Description
        title="Format"
        text={[
          "$45 Starbucks",
          "$12.50 Netflix :Subscriptions",
          "+2000 Paycheck :Income   (+ = income)",
          "$85 Grocery :Food & Dining",
          "$45 Starbucks :Food @Visa   (@ = account override)",
        ].join("\n")}
      />

      <Form.Description title="Account" text={prefs.defaultAccount} />
      <Form.Description title="Date" text={todayFormatted()} />
    </Form>
  );
}
