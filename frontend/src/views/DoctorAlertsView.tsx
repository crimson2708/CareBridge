import { BellRing } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { acknowledgeAlert, apiErrorMessage } from "../api/client";
import AlertCard from "../components/AlertCard";
import { useDoctorContext } from "../DoctorShell";
import { doctorPatientPath } from "../routes";

export default function DoctorAlertsView() {
  const navigate = useNavigate();
  const { alerts, alertsError, refreshAlerts } = useDoctorContext();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function acknowledge(alertId: string) {
    setBusyId(alertId);
    setError(null);
    try {
      await acknowledgeAlert(alertId);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't acknowledge this alert."));
    } finally {
      // refresh on failure too: a 409 means the list here is out of date
      await refreshAlerts();
      setBusyId(null);
    }
  }

  const open = alerts?.open ?? [];
  const acknowledged = alerts?.acknowledged ?? [];

  return (
    <div className="screen-wrapper">
      <header className="screen-header">
        <div>
          <h1 className="screen-title">Alerts</h1>
          <p className="screen-subtitle">
            {alerts ? `${open.length} not acknowledged` : "Loading"}
          </p>
        </div>
      </header>

      {(error || alertsError) && <p className="form-error mb-4">{error ?? alertsError}</p>}

      {!alerts && !alertsError && (
        <div className="space-y-3">
          {[0, 1].map((index) => (
            <div key={index} className="skeleton-row" />
          ))}
        </div>
      )}

      {alerts && open.length === 0 && (
        <div className="empty-state mb-5">
          <span className="empty-state-icon">
            <BellRing size={22} strokeWidth={2.2} />
          </span>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Nothing needs you right now
          </p>
          <p className="max-w-xs text-[0.8rem]">
            Alerts from nurses appear here. This page checks for new ones every 30
            seconds while it's open.
          </p>
        </div>
      )}

      {open.length > 0 && (
        <div className="mb-6 space-y-3">
          {open.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              audience="doctor"
              onOpenPatient={() => navigate(doctorPatientPath(alert.patient_id))}
              onAcknowledge={() => void acknowledge(alert.id)}
              busy={busyId === alert.id}
            />
          ))}
        </div>
      )}

      {acknowledged.length > 0 && (
        <section>
          <p className="section-title mb-2">Acknowledged</p>
          <div className="space-y-3">
            {acknowledged.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                audience="doctor"
                onOpenPatient={() => navigate(doctorPatientPath(alert.patient_id))}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
