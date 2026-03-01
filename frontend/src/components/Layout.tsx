import { Link, Outlet, useLocation } from "react-router-dom";

const nav = [
  { to: "/", label: "Dashboard" },
  { to: "/accounts", label: "Accounts" },
  { to: "/cashflows", label: "Cashflows" },
  { to: "/prices", label: "Prices" },
  { to: "/forecast", label: "Forecast" },
  { to: "/settings", label: "Settings" },
];

export default function Layout() {
  const loc = useLocation();
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside style={{ width: 200, padding: "1.5rem", borderRight: "1px solid #27272a" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Finance</h2>
        <nav style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          {nav.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: 6,
                background: loc.pathname === to ? "#27272a" : "transparent",
              }}
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <main style={{ flex: 1, padding: "1.5rem" }}>
        <Outlet />
      </main>
    </div>
  );
}
