import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, FileText, NotebookPen } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { acknowledgeAlert, apiErrorMessage, getDoctorPatient } from "../api/client";
import type { DoctorPatientDetailResponse } from "../api/types";
import AlertCard from "../components/AlertCard";
import NoteEntry from "../components/NoteEntry";
import SegmentedTabs from "../components/SegmentedTabs";
import { useDoctorContext } from "../DoctorShell";

type Tab = "detail" | "major_decision" | "log";

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "detail", label: "Details" },
  { value: "major_decision", label: "Major Decisions" },
  { value: "log", label: "Log" },
];

const EMPTY_COPY: Record<Tab, string> = {
  detail: "No details recorded",
  major_decision: "No major decisions recorded",
  log: "Nothing logged yet",
};

/** Read-only on purpose: nurses write the record, and the doctor's one action
 * here is acknowledging an alert. */
export default function DoctorPatientDetailView() {
  const { patientId = "" } = useParams();
  const navigate = useNavigate();
  const { alerts: shellAlerts, refreshAlerts } = useDoctorContext();
  const openCount = shellAlerts?.open_count;

  const [data, setData] = useState<DoctorPatientDetailResponse | null>(null);
  const [tab, setTab] = useState<Tab>("log");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getDoctorPatient(patientId));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load this patient."));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load, openCount]);

  const visibleNotes = useMemo(() => {
    const notes = data?.notes ?? [];
    return tab === "log" ? notes : notes.filter((note) => note.section === tab);
  }, [data, tab]);

  async function acknowledge(alertId: string) {
    setBusyId(alertId);
    setError(null);
    try {
      await acknowledgeAlert(alertId);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't acknowledge this alert."));
    } finally {
      await Promise.all([load(), refreshAlerts()]);
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="screen-wrapper flex items-center justify-center">
        <div className="loading-pulse" aria-label="Loading" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="screen-wrapper">
        <button type="button" className="btn-secondary mb-4" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} className="mr-1 inline" /> Back
        </button>
        <p className="form-error">{error ?? "Patient not found."}</p>
      </div>
    );
  }

  const { patient, nurse, alerts } = data;
  const openAlerts = alerts.filter((alert) => alert.status === "open");
  const earlierAlerts = alerts.filter((alert) => alert.status !== "open");

  return (
    <div className="screen-wrapper">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-3 flex items-center gap-1.5 text-[0.78rem] font-bold text-[var(--text-muted)]"
      >
        <ArrowLeft size={15} strokeWidth={2.4} />
        Back
      </button>

      <header className="mb-4">
        <h1 className="screen-title">{patient.full_name}</h1>
        <p className="screen-subtitle">
          {patient.mrn} · {patient.ward ?? "—"} · Bed {patient.bed ?? "—"}
        </p>
        <p className="mt-2 text-[0.78rem] text-[var(--text-muted)]">
          {nurse ? `Current nurse: ${nurse.full_name}` : "No nurse assigned"}
        </p>
      </header>

      {error && <p className="form-error mb-4">{error}</p>}

      {openAlerts.length > 0 && (
        <div className="mb-5 space-y-3">
          {openAlerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              audience="doctor"
              onAcknowledge={() => void acknowledge(alert.id)}
              busy={busyId === alert.id}
            />
          ))}
        </div>
      )}

      <SegmentedTabs
        value={tab}
        onChange={setTab}
        options={TABS}
        layoutId="doctor-patient-tabs"
      />

      <div className="mt-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            {visibleNotes.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-icon">
                  {tab === "log" ? (
                    <FileText size={22} strokeWidth={2.2} />
                  ) : (
                    <NotebookPen size={22} strokeWidth={2.2} />
                  )}
                </span>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {EMPTY_COPY[tab]}
                </p>
              </div>
            ) : (
              visibleNotes.map((note) => <NoteEntry key={note.id} note={note} />)
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {earlierAlerts.length > 0 && (
        <section className="mt-6">
          <p className="section-title mb-2">Earlier alerts</p>
          <div className="space-y-3">
            {earlierAlerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} audience="doctor" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
