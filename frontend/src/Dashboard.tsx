import { motion } from "framer-motion";
import { ArrowRight, Inbox, LogOut, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  apiErrorMessage,
  endShift,
  getInbox,
  listMyPatients,
} from "./api/client";
import StatusPill from "./components/StatusPill";
import type { AssignedPatient, Handoff } from "./api/types";
import { relativeTime } from "./lib/format";
import { fadeUp } from "./lib/motion";
import { handoffReviewPath, patientDetailPath } from "./routes";
import { useAuth } from "./state/AuthContext";

export default function Dashboard() {
  const navigate = useNavigate();
  const { staff, shift, refreshShift } = useAuth();

  const [patients, setPatients] = useState<AssignedPatient[]>([]);
  const [inbox, setInbox] = useState<Handoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [endingShift, setEndingShift] = useState(false);

  const load = useCallback(async () => {
    try {
      const [patientsRes, inboxRes] = await Promise.all([
        listMyPatients(),
        getInbox(),
      ]);
      setPatients(patientsRes.patients);
      setInbox(inboxRes.handoffs);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load your shift."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onEndShift() {
    setEndingShift(true);
    setError(null);
    try {
      await endShift();
      await refreshShift();
      await load();
    } catch (err) {
      // the API refuses while patients are still on her name, and says which
      setError(apiErrorMessage(err, "Couldn't end your shift."));
    } finally {
      setEndingShift(false);
    }
  }

  const firstName = staff?.full_name?.split(" ")[0] ?? "there";

  const stats = [
    { label: "Patients", value: patients.length, icon: Users, to: "/patients" },
    { label: "Incoming", value: inbox.length, icon: Inbox, to: "/handoff" },
  ];

  return (
    <div className="screen-wrapper">
      <header className="screen-header">
        <div>
          <h1 className="screen-title">Hi, {firstName}</h1>
          <p className="screen-subtitle">
            {shift ? `On shift since ${relativeTime(shift.started_at)}` : "No open shift"}
          </p>
        </div>
      </header>

      {error && <p className="form-error mb-4">{error}</p>}

      <motion.div
        custom={0}
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="mb-4 grid grid-cols-2 gap-3"
      >
        {stats.map(({ label, value, icon: Icon, to }) => (
          <button
            key={label}
            type="button"
            disabled={!to}
            onClick={() => to && navigate(to)}
            className="glass-panel flex flex-col items-start gap-1.5 p-4 disabled:cursor-default"
          >
            <Icon size={16} strokeWidth={2.3} style={{ color: "var(--primary-contrast)" }} />
            <span className="text-[1.5rem] font-extrabold leading-none text-[var(--text-primary)]">
              {loading ? "–" : value}
            </span>
            <span className="text-[0.68rem] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              {label}
            </span>
          </button>
        ))}
      </motion.div>

      {inbox.length > 0 && (
        <motion.section
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mb-4"
        >
          <p className="section-title mb-2">Waiting on you</p>
          <div className="space-y-2">
            {inbox.slice(0, 3).map((handoff) => (
              <button
                key={handoff.id}
                type="button"
                className="handoff-card"
                onClick={() => navigate(handoffReviewPath(handoff.id))}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="patient-name">
                      {handoff.patient?.full_name ?? "Patient"}
                    </p>
                    <p className="patient-meta">
                      from {handoff.from_nurse?.full_name ?? "a colleague"} ·{" "}
                      {relativeTime(handoff.sent_at)}
                    </p>
                  </div>
                  <StatusPill status={handoff.status} />
                </div>
              </button>
            ))}
          </div>
        </motion.section>
      )}

      <motion.section custom={2} variants={fadeUp} initial="hidden" animate="visible">
        <div className="mb-2 flex items-center justify-between">
          <p className="section-title">Your patients</p>
          <button
            type="button"
            onClick={() => navigate("/patients")}
            className="flex items-center gap-1 text-[0.72rem] font-bold"
            style={{ color: "var(--primary-contrast)" }}
          >
            See all
            <ArrowRight size={12} strokeWidth={2.6} />
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        ) : patients.length === 0 ? (
          <p className="text-[0.82rem] text-[var(--text-muted)]">
            Nobody assigned to you right now.
          </p>
        ) : (
          <div className="space-y-2">
            {patients.slice(0, 4).map((patient) => (
              <button
                key={patient.id}
                type="button"
                className="patient-row"
                onClick={() => navigate(patientDetailPath(patient.id))}
              >
                <span className="patient-bed">{patient.bed ?? "—"}</span>
                <span className="min-w-0 flex-1">
                  <p className="patient-name">{patient.full_name}</p>
                  <p className="patient-meta">
                    {patient.last_note_at
                      ? `last note ${relativeTime(patient.last_note_at)}`
                      : "no notes yet"}
                  </p>
                </span>
              </button>
            ))}
          </div>
        )}
      </motion.section>

      {shift && (
        <motion.div
          custom={3}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mt-6"
        >
          <button
            type="button"
            className="btn-secondary flex w-full items-center justify-center gap-2"
            onClick={() => void onEndShift()}
            disabled={endingShift}
          >
            <LogOut size={15} strokeWidth={2.3} />
            {endingShift ? "Ending shift…" : "End shift"}
          </button>
          <p className="mt-2 text-center text-[0.72rem] text-[var(--text-muted)]">
            You'll need to hand off your patients first.
          </p>
        </motion.div>
      )}
    </div>
  );
}
