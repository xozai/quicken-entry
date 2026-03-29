/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Default Account - Account used for Quick Expense and as the default for Add Transaction */
  "defaultAccount": string,
  /** Accounts - Comma-separated list of your Quicken account names (must match exactly) */
  "accounts": string,
  /** Categories - Comma-separated list of Quicken categories for the dropdown */
  "categories"?: string,
  /** Quicken Window - When disabled, Quicken stays in the background after the transaction is saved */
  "bringToForeground": boolean,
  /** Tag Column - Disable if your Quicken register has no Tag column — otherwise field values will land in the wrong columns */
  "skipTagField": boolean,
  /** Automation Speed - Slow down if transactions are entered with wrong values on a slower Mac */
  "uiDelay": "fast" | "normal" | "slow"
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `add-transaction` command */
  export type AddTransaction = ExtensionPreferences & {}
  /** Preferences accessible in the `quick-expense` command */
  export type QuickExpense = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `add-transaction` command */
  export type AddTransaction = {}
  /** Arguments passed to the `quick-expense` command */
  export type QuickExpense = {
  /** $45 Starbucks :Food */
  "fallbackText": string
}
}

