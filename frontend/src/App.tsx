import { ClipboardList, LayoutDashboard, LogOut, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { getInbox } from "./api/client";
import UniversalBottomNav, { type TabDef } from "./components/UniversalBottomNav";
import { useAuth } from "./state/AuthContext";

const TABS: TabDef[] = [
  { route: "/dashboard", label: "Shift", icon: LayoutDashboard },
  { route: "/patients", label: "My Patients", icon: Users },
  { route: "/handoff", label: "Handoff", icon: ClipboardList },
];

function AppShell() {
  const { staff, shift, signOut } = useAuth();
  const location = useLocation();
  const [inboxCount, setInboxCount] = useState(0);

  const refreshInbox = useCallback(async () => {
    try {
      const { count } = await getInbox();
      setInboxCount(count);
    } catch {
      // a badge is not worth interrupting the shift over
    }
  }, []);

  // re-check on every navigation: cheap, and it keeps the badge honest after
  // she accepts or declines something
  useEffect(() => {
    void refreshInbox();
  }, [refreshInbox, location.pathname]);

  return (
    <div className="app-shell">
      <header className="shift-banner">
        <div className="min-w-0">
          <p className="shift-banner-name">{staff?.full_name ?? "…"}</p>
          <p className="shift-banner-meta">
            {staff?.ward ?? "Unassigned ward"}
            {shift ? " · On shift" : " · No open shift"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="shift-banner-signout"
          aria-label="Sign out"
        >
          <LogOut size={16} strokeWidth={2.2} />
        </button>
      </header>

      <div className="app-content">
        <Outlet />
      </div>

      <UniversalBottomNav tabs={TABS} badgeRoute="/handoff" badgeCount={inboxCount} />
    </div>
  );
}

export default AppShell;
