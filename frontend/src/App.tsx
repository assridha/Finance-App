import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DisplayCurrencyProvider } from "./contexts/DisplayCurrencyContext";
import { DefaultDebtInterestRateProvider } from "./contexts/DefaultDebtInterestRateContext";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import Cashflows from "./pages/Cashflows";
import Prices from "./pages/Prices";
import Forecast from "./pages/Forecast";
import PriceModels from "./pages/PriceModels";
import Settings from "./pages/Settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60 * 1000 },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DisplayCurrencyProvider>
        <DefaultDebtInterestRateProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="accounts" element={<Accounts />} />
                <Route path="cashflows" element={<Cashflows />} />
                <Route path="prices" element={<Prices />} />
                <Route path="forecast" element={<Forecast />} />
                <Route path="price-models" element={<PriceModels />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </DefaultDebtInterestRateProvider>
      </DisplayCurrencyProvider>
    </QueryClientProvider>
  );
}

export default App;
