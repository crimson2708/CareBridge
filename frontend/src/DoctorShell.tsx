import { BellRing, LogOut, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Outlet, useOutletContext } from "react-router-dom";

import { apiErrorMessage, getDoctorAlerts } from "./api/client";
import type { DoctorAlertsResponse } from "./api/types";
import UniversalBottomNav, { type TabDef } from "./components/UniversalBottomNav";
import { DOCTOR_ALERTS_ROUTE, DOCTOR_PATIENTS_ROUTE } from "./routes";
import { useAuth } from "./state/AuthContext";

const TABS: TabDef[] = [
  { route: DOCTOR_PATIENTS_ROUTE, label: "My Patients", icon: Users },
  { route: DOCTOR_ALERTS_ROUTE, label: "Alerts", icon: BellRing },
];

const ALERT_POLL_MS = 30_000;

type DoctorContext = {
  alerts: DoctorAlertsResponse | null;
  alertsError: string | null;
  refreshAlerts: () => Promise<void>;
};

export function useDoctorContext() {
  return useOutletContext<DoctorContext>();
}

export default function DoctorShell() {
  const { staff, signOut } = useAuth();
  const [alerts, setAlerts] = useState<DoctorAlertsResponse | null>(null);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  const refreshAlerts = useCallback(async () => {
    try {
      setAlerts(await getDoctorAlerts());
      setAlertsError(null);
    } catch (err) {
      setAlertsError(apiErrorMessage(err, "Couldn't check for new alerts."));
    }
  }, []);

  // an alert only helps if it reaches them while the app sits open on a ward
  useEffect(() => {
    void refreshAlerts();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refreshAlerts();
    }, ALERT_POLL_MS);
    return () => clearInterval(timer);
  }, [refreshAlerts]);

  return (
    <div className="app-shell">
      <header className="shift-banner">
        <div className="min-w-0">
          <p className="shift-banner-name">{staff?.full_name ?? "…"}</p>
          <p className="shift-banner-meta">{staff?.ward ?? "All wards"} · Doctor</p>
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
        <Outlet context={{ alerts, alertsError, refreshAlerts } satisfies DoctorContext} />
      </div>

      <UniversalBottomNav
        tabs={TABS}
        badgeRoute={DOCTOR_ALERTS_ROUTE}
        badgeCount={alerts?.open_count ?? 0}
      />
    </div>
  );
}
