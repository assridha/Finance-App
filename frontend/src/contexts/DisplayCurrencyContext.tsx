import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fxApi } from "../api";

const DISPLAY_CURRENCY_KEY = "displayCurrency";

function getStoredDisplayCurrency(): string {
  if (typeof window === "undefined") return "USD";
  return window.localStorage.getItem(DISPLAY_CURRENCY_KEY) || "USD";
}

type DisplayCurrencyContextValue = {
  displayCurrency: string;
  setDisplayCurrency: (code: string) => void;
  /** Rate from USD to display currency (1 when USD). Use for converting backend USD values. */
  rateUsdToDisplay: number;
  /** Format a USD amount for display in the selected currency. Falls back to USD if rate unavailable. */
  formatUsdForDisplay: (usdAmount: number, options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }) => string;
  /** Format an amount that is already in display currency (e.g. after converting with historical rate). */
  formatDisplayAmount: (amount: number, options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }) => string;
  /** Currency code/symbol for labels (e.g. "EUR") */
  currencyLabel: string;
  /** True when display currency is not USD and we are still loading the rate */
  isLoadingRate: boolean;
};

const DisplayCurrencyContext = createContext<DisplayCurrencyContextValue | null>(null);

export function DisplayCurrencyProvider({ children }: { children: React.ReactNode }) {
  const [displayCurrency, setDisplayCurrencyState] = useState(getStoredDisplayCurrency);

  const setDisplayCurrency = useCallback((code: string) => {
    const next = (code || "USD").toUpperCase().slice(0, 3);
    setDisplayCurrencyState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISPLAY_CURRENCY_KEY, next);
    }
  }, []);

  const { data: rateData, isLoading: isLoadingRate } = useQuery({
    queryKey: ["fx", "USD", displayCurrency],
    queryFn: () => fxApi.rate("USD", displayCurrency),
    enabled: displayCurrency !== "USD",
    staleTime: 60 * 60 * 1000,
  });

  const rateUsdToDisplay = displayCurrency === "USD" ? 1 : rateData?.rate ?? 1;

  const formatUsdForDisplay = useCallback(
    (usdAmount: number, options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }) => {
      const converted = usdAmount * rateUsdToDisplay;
      const opts = {
        minimumFractionDigits: options?.minimumFractionDigits ?? 2,
        maximumFractionDigits: options?.maximumFractionDigits ?? 2,
      };
      if (displayCurrency === "USD") {
        return converted.toLocaleString("en-US", { ...opts, style: "currency", currency: "USD" });
      }
      return `${converted.toLocaleString("en-US", opts)} ${displayCurrency}`;
    },
    [displayCurrency, rateUsdToDisplay]
  );

  const formatDisplayAmount = useCallback(
    (amount: number, options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }) => {
      const opts = {
        minimumFractionDigits: options?.minimumFractionDigits ?? 2,
        maximumFractionDigits: options?.maximumFractionDigits ?? 2,
      };
      if (displayCurrency === "USD") {
        return amount.toLocaleString("en-US", { ...opts, style: "currency", currency: "USD" });
      }
      return `${amount.toLocaleString("en-US", opts)} ${displayCurrency}`;
    },
    [displayCurrency]
  );

  const value: DisplayCurrencyContextValue = useMemo(
    () => ({
      displayCurrency,
      setDisplayCurrency,
      rateUsdToDisplay,
      formatUsdForDisplay,
      formatDisplayAmount,
      currencyLabel: displayCurrency,
      isLoadingRate: displayCurrency !== "USD" && isLoadingRate,
    }),
    [displayCurrency, setDisplayCurrency, rateUsdToDisplay, formatUsdForDisplay, formatDisplayAmount, isLoadingRate]
  );

  return (
    <DisplayCurrencyContext.Provider value={value}>
      {children}
    </DisplayCurrencyContext.Provider>
  );
}

export function useDisplayCurrency(): DisplayCurrencyContextValue {
  const ctx = useContext(DisplayCurrencyContext);
  if (!ctx) throw new Error("useDisplayCurrency must be used within DisplayCurrencyProvider");
  return ctx;
}

/** Fetch FX rate (amount_from * rate = amount_to). Optional date for historical rate. */
export function useFxRate(from: string, to: string, date?: string) {
  const { data, isLoading } = useQuery({
    queryKey: ["fx", from, to, date ?? "current"],
    queryFn: () => fxApi.rate(from, to, date),
    enabled: (from || "USD").toUpperCase() !== (to || "USD").toUpperCase(),
    staleTime: date ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000,
  });
  return { rate: data?.rate ?? 1, isLoading };
}
