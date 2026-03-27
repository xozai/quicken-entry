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
  "bringToForeground": boolean
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
  export type QuickExpense = {}
}

