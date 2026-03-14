import { useState, useEffect } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [loc.pathname]);

  useEffect(() => {
    if (menuOpen) {
      document.body.classList.add("layout-drawer-open");
    } else {
      document.body.classList.remove("layout-drawer-open");
    }
    return () => document.body.classList.remove("layout-drawer-open");
  }, [menuOpen]);

  return (
    <div className="layout-root">
      <header className="layout-header">
        <button
          type="button"
          className="layout-hamburger"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
        >
          <span className="layout-hamburger-bar" />
          <span className="layout-hamburger-bar" />
          <span className="layout-hamburger-bar" />
        </button>
        <h2 className="layout-header-title">Finance App</h2>
      </header>

      {menuOpen && (
        <div
          className="layout-overlay"
          onClick={() => setMenuOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setMenuOpen(false)}
          role="button"
          tabIndex={-1}
          aria-label="Close menu"
        />
      )}

      <aside
        className={`layout-sidebar ${menuOpen ? "layout-drawer-open" : ""}`}
        aria-hidden={!menuOpen}
      >
        <div className="layout-sidebar-inner">
          <button
            type="button"
            className="layout-drawer-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            ×
          </button>
          <h2 className="layout-sidebar-title">Finance App</h2>
          <nav className="layout-nav">
            {nav.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={loc.pathname === to ? "layout-nav-link active" : "layout-nav-link"}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      <main className="layout-main">
        <Outlet />
      </main>
    </div>
  );
}
