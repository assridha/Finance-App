/**
 * Format an amount in a given currency using the currency symbol (e.g. €1,234.56).
 * Use for displaying values in a specific currency code (e.g. per-row currency on Cashflows).
 */
export function formatAmountInCurrency(
  amount: number,
  currencyCode: string,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
): string {
  const code = (currencyCode || "USD").trim().toUpperCase().slice(0, 3) || "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    minimumFractionDigits: options?.minimumFractionDigits ?? 2,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  }).format(amount);
}

/** Return the currency symbol for a code (e.g. "EUR" -> "€"). Used for labels. */
export function getCurrencySymbol(currencyCode: string): string {
  const code = (currencyCode || "USD").trim().toUpperCase().slice(0, 3) || "USD";
  const parts = new Intl.NumberFormat("en-US", { style: "currency", currency: code }).formatToParts(0);
  return parts.find((p) => p.type === "currency")?.value ?? code;
}
