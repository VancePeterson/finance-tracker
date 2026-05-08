import { NavLink, Outlet } from "react-router-dom";

export default function Settings() {
  return (
    <>
      <h2>Settings</h2>
      <nav className="settings-tabs" style={{ display: "flex", gap: 16, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
        <NavLink to="/settings/general" className="settings-tab">General</NavLink>
        <NavLink to="/settings/claude" className="settings-tab">Claude</NavLink>
        <NavLink to="/settings/export" className="settings-tab">Export</NavLink>
      </nav>
      <Outlet />
    </>
  );
}
