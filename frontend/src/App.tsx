import { useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Categories from "./pages/Categories";
import Accounts from "./pages/Accounts";
import Goals from "./pages/Goals";
import Budgets from "./pages/Budgets";
import Settings from "./pages/Settings";
import SettingsGeneral from "./pages/SettingsGeneral";
import SettingsClaude from "./pages/SettingsClaude";
import SettingsExport from "./pages/SettingsExport";
import { api } from "./api";

function SyncButton() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api.sync.run(),
    onSuccess: () => qc.invalidateQueries(),
  });
  return (
    <button
      onClick={() => m.mutate()}
      disabled={m.isPending}
      style={{ width: "100%", marginTop: "auto" }}
    >
      {m.isPending ? "Syncing…" : "Sync now"}
    </button>
  );
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="layout">
      {/* Hamburger button - visible only on mobile */}
      <button
        className={`menu-toggle ${sidebarOpen ? "open" : ""}`}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle menu"
      >
        <span />
        <span />
        <span />
      </button>

      {/* Overlay backdrop */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`}
        onClick={closeSidebar}
      />

      <nav className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <h1>finances</h1>
        <NavLink to="/" end onClick={closeSidebar}>Dashboard</NavLink>
        <NavLink to="/transactions" onClick={closeSidebar}>Transactions</NavLink>
        <NavLink to="/categories" onClick={closeSidebar}>Categories &amp; Rules</NavLink>
        <NavLink to="/budgets" onClick={closeSidebar}>Budgets</NavLink>
        <NavLink to="/goals" onClick={closeSidebar}>Goals</NavLink>
        <NavLink to="/accounts" onClick={closeSidebar}>Accounts</NavLink>
        <NavLink to="/settings" onClick={closeSidebar}>Settings</NavLink>
        <SyncButton />
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/settings" element={<Settings />}>
            <Route index element={<Navigate to="general" replace />} />
            <Route path="general" element={<SettingsGeneral />} />
            <Route path="claude" element={<SettingsClaude />} />
            <Route path="export" element={<SettingsExport />} />
          </Route>
        </Routes>
      </main>
    </div>
  );
}
