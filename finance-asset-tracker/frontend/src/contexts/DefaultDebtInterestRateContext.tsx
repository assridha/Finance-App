import { createContext, useCallback, useContext, useMemo, useState } from "react";

const DEFAULT_DEBT_INTEREST_RATE_KEY = "defaultDebtInterestRate";
const DEFAULT_RATE = 0.08;

function getStoredDefaultDebtInterestRate(): number {
  if (typeof window === "undefined") return DEFAULT_RATE;
  const stored = window.localStorage.getItem(DEFAULT_DEBT_INTEREST_RATE_KEY);
  if (stored == null || stored === "") return DEFAULT_RATE;
  const n = parseFloat(stored);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_RATE;
}

type DefaultDebtInterestRateContextValue = {
  defaultDebtInterestRate: number;
  setDefaultDebtInterestRate: (rate: number) => void;
};

const DefaultDebtInterestRateContext = createContext<DefaultDebtInterestRateContextValue | null>(null);

export function DefaultDebtInterestRateProvider({ children }: { children: React.ReactNode }) {
  const [defaultDebtInterestRate, setDefaultDebtInterestRateState] = useState(getStoredDefaultDebtInterestRate);

  const setDefaultDebtInterestRate = useCallback((rate: number) => {
    const next = Number.isFinite(rate) && rate >= 0 ? rate : DEFAULT_RATE;
    setDefaultDebtInterestRateState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DEFAULT_DEBT_INTEREST_RATE_KEY, String(next));
    }
  }, []);

  const value: DefaultDebtInterestRateContextValue = useMemo(
    () => ({ defaultDebtInterestRate, setDefaultDebtInterestRate }),
    [defaultDebtInterestRate, setDefaultDebtInterestRate]
  );

  return (
    <DefaultDebtInterestRateContext.Provider value={value}>
      {children}
    </DefaultDebtInterestRateContext.Provider>
  );
}

export function useDefaultDebtInterestRate(): DefaultDebtInterestRateContextValue {
  const ctx = useContext(DefaultDebtInterestRateContext);
  if (!ctx) throw new Error("useDefaultDebtInterestRate must be used within DefaultDebtInterestRateProvider");
  return ctx;
}
