import type { Alert } from "../api/types";
import { clockTime, durationBetween, relativeTime } from "../lib/format";

type AlertCardProps = {
  alert: Alert;
  /** The doctor reads who it came from; the nurse reads who it went to. */
  audience: "doctor" | "nurse";
  onOpenPatient?: () => void;
  onAcknowledge?: () => void;
  busy?: boolean;
};

export default function AlertCard({
  alert,
  audience,
  onOpenPatient,
  onAcknowledge,
  busy = false,
}: AlertCardProps) {
  const isOpen = alert.status === "open";
  const took = durationBetween(alert.created_at, alert.acknowledged_at);
  const person =
    audience === "doctor"
      ? `From ${alert.raised_by_staff?.full_name ?? "a nurse"}`
      : `To ${alert.doctor?.full_name ?? "the doctor"}`;

  return (
    <article className="note-entry">
      <div className="note-meta">
        <span className={isOpen ? "status-pill is-pending" : "status-pill is-accepted"}>
          {isOpen
            ? "Not acknowledged"
            : took
              ? `Acknowledged in ${took}`
              : "Acknowledged"}
        </span>
        <span>{clockTime(alert.created_at)}</span>
        <span>· {relativeTime(alert.created_at)}</span>
        <span>· {person}</span>
      </div>

      {onOpenPatient && (
        <button type="button" className="alert-patient" onClick={onOpenPatient}>
          {alert.patient?.full_name ?? "Patient"} · Bed {alert.patient?.bed ?? "—"}
        </button>
      )}

      <p className="note-body">{alert.message ?? "No message added."}</p>

      {isOpen && onAcknowledge && (
        <button
          type="button"
          className="btn-primary mt-3 w-full"
          onClick={onAcknowledge}
          disabled={busy}
        >
          {busy ? "Working…" : "Acknowledge"}
        </button>
      )}
    </article>
  );
}
