import { LocalStorage } from "@raycast/api";

const PAYEES_KEY = "recent_payees";
const CATEGORIES_KEY = "recent_categories";
const MAX_RECENT = 25;

// ---------------------------------------------------------------------------
// Recent Payees
// ---------------------------------------------------------------------------

export async function getRecentPayees(): Promise<string[]> {
  const raw = await LocalStorage.getItem<string>(PAYEES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export async function addRecentPayee(payee: string): Promise<void> {
  const trimmed = payee.trim();
  if (!trimmed) return;

  const existing = await getRecentPayees();
  // Move to front, dedup, cap length
  const updated = [trimmed, ...existing.filter((p) => p !== trimmed)].slice(0, MAX_RECENT);
  await LocalStorage.setItem(PAYEES_KEY, JSON.stringify(updated));
}

// ---------------------------------------------------------------------------
// Recent Categories
// ---------------------------------------------------------------------------

export async function getRecentCategories(): Promise<string[]> {
  const raw = await LocalStorage.getItem<string>(CATEGORIES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export async function addRecentCategory(category: string): Promise<void> {
  const trimmed = category.trim();
  if (!trimmed) return;

  const existing = await getRecentCategories();
  const updated = [trimmed, ...existing.filter((c) => c !== trimmed)].slice(0, MAX_RECENT);
  await LocalStorage.setItem(CATEGORIES_KEY, JSON.stringify(updated));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Merge two string arrays, deduplicated, preserving order (a first). */
export function mergeUnique(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  return [...a, ...b].filter((v) => {
    if (seen.has(v)) return false;
    seen.add(v);
    return true;
  });
}
