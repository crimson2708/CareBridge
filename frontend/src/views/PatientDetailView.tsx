import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  BellRing,
  FileText,
  NotebookPen,
  PenLine,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  apiErrorMessage,
  getPatient,
  listNotes,
  listPatientAlerts,
  raiseAlert,
} from "../api/client";
import AlertCard from "../components/AlertCard";
import BottomSheet from "../components/BottomSheet";
import NoteEntry from "../components/NoteEntry";
import SegmentedTabs from "../components/SegmentedTabs";
import type { Alert, PatientNote, PatientDetailResponse } from "../api/types";
import { patientNotePath } from "../routes";

type Tab = "detail" | "major_decision" | "log";

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "detail", label: "Details" },
  { value: "major_decision", label: "Major Decisions" },
  { value: "log", label: "Log" },
];

export default function PatientDetailView() {
  const { patientId = "" } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState<PatientDetailResponse | null>(null);
  const [notes, setNotes] = useState<PatientNote[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [tab, setTab] = useState<Tab>("detail");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [alertSheetOpen, setAlertSheetOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [alertError, setAlertError] = useState<string | null>(null);
  const [sendingAlert, setSendingAlert] = useState(false);

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const [detail, noteList, alertList] = await Promise.all([
        getPatient(patientId),
        listNotes(patientId),
        listPatientAlerts(patientId),
      ]);
      setData(detail);
      setNotes(noteList.notes);
      setAlerts(alertList.alerts);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load this patient."));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  // one fetch feeds all three tabs; the log is just the unfiltered list
  const visibleNotes = useMemo(
    () => (tab === "log" ? notes : notes.filter((note) => note.section === tab)),
    [notes, tab],
  );

  async function sendAlert() {
    setSendingAlert(true);
    setAlertError(null);
    try {
      await raiseAlert(patientId, alertMessage.trim());
      setAlertSheetOpen(false);
      setAlertMessage("");
      setAlerts((await listPatientAlerts(patientId)).alerts);
    } catch (err) {
      setAlertError(apiErrorMessage(err, "The alert didn't send. Escalate in person."));
    } finally {
      setSendingAlert(false);
    }
  }

  if (loading) {
    return (
      <div className="screen-wrapper flex items-center justify-center">
        <div className="loading-pulse" aria-label="Loading" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="screen-wrapper">
        <button type="button" className="btn-secondary mb-4" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} className="mr-1 inline" /> Back
        </button>
        <p className="form-error">{error ?? "Patient not found."}</p>
      </div>
    );
  }

  const { patient, doctor, is_mine: isMine } = data;

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
          {doctor ? `Under ${doctor.full_name}` : "No doctor assigned"}
        </p>
      </header>

      {!isMine && (
        <p className="form-error mb-4">
          This patient isn't under your care yet — you're viewing them because a
          handoff is waiting for your response.
        </p>
      )}

      {isMine && (
        <div className="mb-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            className="btn-primary flex items-center justify-center gap-2"
            onClick={() => navigate(patientNotePath(patient.id))}
          >
            <PenLine size={16} strokeWidth={2.4} />
            Add note
          </button>
          <button
            type="button"
            className="btn-danger flex items-center justify-center gap-2"
            disabled={!doctor}
            title={doctor ? undefined : "No doctor assigned"}
            onClick={() => {
              setAlertError(null);
              setAlertSheetOpen(true);
            }}
          >
            <BellRing size={16} strokeWidth={2.4} />
            Alert doctor
          </button>
        </div>
      )}

      {alerts.length > 0 && (
        <section className="mb-5">
          <p className="section-title mb-2">Alerts</p>
          <div className="space-y-2">
            {alerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} audience="nurse" />
            ))}
          </div>
        </section>
      )}

      <SegmentedTabs
        value={tab}
        onChange={setTab}
        options={TABS}
        layoutId="patient-tabs"
      />

      <div className="mt-4 space-y-3">
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
                  {tab === "detail"
                    ? "No details recorded yet"
                    : tab === "major_decision"
                      ? "No major decisions this shift"
                      : "Nothing logged yet"}
                </p>
                {isMine && (
                  <p className="max-w-xs text-[0.8rem]">
                    Notes you record build up here through the shift, so there's
                    nothing to reconstruct at handoff.
                  </p>
                )}
              </div>
            ) : (
              visibleNotes.map((note) => <NoteEntry key={note.id} note={note} />)
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <BottomSheet
        open={alertSheetOpen}
        title={`Alert ${doctor?.full_name ?? "the doctor"}`}
        onClose={() => setAlertSheetOpen(false)}
      >
        <p className="mb-3 text-[0.8rem] text-[var(--text-muted)]">
          This appears in the doctor's app within 30 seconds, but only if they have it
          open. For anything urgent, also call them.
        </p>
        <label className="field-label" htmlFor="alert-message">
          Message (optional)
        </label>
        <textarea
          id="alert-message"
          className="field-textarea"
          rows={3}
          maxLength={500}
          value={alertMessage}
          onChange={(event) => setAlertMessage(event.target.value)}
          placeholder="e.g. BP dropping since 14:00, please review."
        />
        {alertError && <p className="form-error mt-3">{alertError}</p>}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={() => setAlertSheetOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger flex-1"
            onClick={() => void sendAlert()}
            disabled={sendingAlert}
          >
            {sendingAlert ? "Sending…" : "Send alert"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
