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
import {
  enterTransaction,
  checkAccessibilityPermissions,
  isQuickenInstalled,
} from "./utils/applescript";
import { addRecentPayee, addRecentCategory } from "./utils/storage";

interface Preferences {
  defaultAccount: string;
  bringToForeground: boolean;
}

// ---------------------------------------------------------------------------
// Natural-language parser
//
// Supported formats:
//   $45 Starbucks
//   $45.50 Starbucks :Food & Dining
//   45 Netflix :Subscriptions
//   +45 Paycheck :Income       (+ prefix = income)
//   -12 Lunch :Food            (- prefix = expense, explicit)
// ---------------------------------------------------------------------------
export interface ParsedExpense {
  amount: number;
  payee: string;
  category: string;
  isExpense: boolean;
}

export function parseQuickExpense(raw: string): ParsedExpense | null {
  const input = raw.trim();
  if (!input) return null;

  // Match: optional sign, optional $, amount, space, payee, optional :category
  const match = input.match(
    /^([+-]?)\$?(\d+(?:\.\d{1,2})?)\s+(.+?)(?:\s+:(.+))?$/,
  );
  if (!match) return null;

  const sign = match[1]; // "+", "-", or ""
  const amount = parseFloat(match[2]);
  const payee = match[3].trim();
  const category = match[4]?.trim() ?? "";

  if (isNaN(amount) || amount <= 0) return null;
  if (!payee) return null;

  return {
    amount,
    payee,
    category,
    isExpense: sign !== "+",
  };
}

function todayFormatted(): string {
  const d = new Date();
  return [
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
    d.getFullYear(),
  ].join("/");
}

function formatPreview(p: ParsedExpense, account: string): string {
  const sign = p.isExpense ? "−" : "+";
  const cat = p.category ? ` · ${p.category}` : "";
  return `**${sign}$${p.amount.toFixed(2)}**  ${p.payee}${cat}  →  ${account}`;
}

// ---------------------------------------------------------------------------
// Guard
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
export default function QuickExpense() {
  const prefs = getPreferenceValues<Preferences>();

  const [ready, setReady] = useState<boolean | null>(null);
  const [guardReason, setGuardReason] = useState<
    "permissions" | "not-installed" | null
  >(null);
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  if (ready === null) return <Form isLoading />;
  if (!ready && guardReason)
    return <AccessibilityWarning reason={guardReason} />;

  const parsed = parseQuickExpense(inputValue);

  async function handleSubmit(values: { input: string }) {
    const p = parseQuickExpense(values.input);
    if (!p) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not parse",
        message: 'Try: "$45 Starbucks :Food" or "+500 Paycheck :Income"',
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
        account: prefs.defaultAccount,
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
      toast.message = `${p.isExpense ? "−" : "+"}$${p.amount.toFixed(2)} · ${p.payee} → ${prefs.defaultAccount}`;
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
          text='⚠️  Cannot parse — use "$amount Payee [:Category]"'
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
        ].join("\n")}
      />

      <Form.Description title="Account" text={prefs.defaultAccount} />
      <Form.Description title="Date" text={todayFormatted()} />
    </Form>
  );
}
