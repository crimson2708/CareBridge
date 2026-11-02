import { motion } from "framer-motion";
import { ChevronRight, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiErrorMessage, listDoctorPatients } from "../api/client";
import type { DoctorPatient } from "../api/types";
import { useDoctorContext } from "../DoctorShell";
import { relativeTime } from "../lib/format";
import { fadeUp } from "../lib/motion";
import { doctorPatientPath } from "../routes";

export default function DoctorPatientsView() {
  const navigate = useNavigate();
  const { alerts } = useDoctorContext();
  const openCount = alerts?.open_count;

  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { patients: rows } = await listDoctorPatients();
      setPatients(rows);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load your patients."));
    } finally {
      setLoading(false);
    }
  }, []);

  // reloading when the open count moves keeps the alert pills and order honest
  useEffect(() => {
    void load();
  }, [load, openCount]);

  return (
    <div className="screen-wrapper">
      <header className="screen-header">
        <div>
          <h1 className="screen-title">My Patients</h1>
          <p className="screen-subtitle">
            {loading ? "Loading" : `${patients.length} under your care`}
          </p>
        </div>
      </header>

      {error && <p className="form-error mb-4">{error}</p>}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="skeleton-row" />
          ))}
        </div>
      ) : patients.length === 0 && !error ? (
        <div className="empty-state">
          <span className="empty-state-icon">
            <Users size={24} strokeWidth={2.2} />
          </span>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            No patients assigned
          </p>
          <p className="max-w-xs text-[0.8rem]">
            Patients appear here once an administrator assigns them to you.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {patients.map((patient, index) => (
            <motion.button
              key={patient.id}
              type="button"
              custom={index}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              whileTap={{ scale: 0.99 }}
              className="patient-row"
              onClick={() => navigate(doctorPatientPath(patient.id))}
            >
              <span className="patient-bed">{patient.bed ?? "—"}</span>

              <span className="min-w-0 flex-1">
                <p className="patient-name">{patient.full_name}</p>
                <p className="patient-meta">
                  {patient.mrn}
                  {" · "}
                  {patient.nurse?.full_name ?? "No nurse assigned"}
                </p>
                <p className="patient-meta">
                  {patient.note_count} note{patient.note_count === 1 ? "" : "s"}
                  {patient.last_note_at
                    ? ` · last ${relativeTime(patient.last_note_at)}`
                    : ""}
                </p>
              </span>

              {patient.open_alert_count > 0 && (
                <span className="status-pill is-pending">
                  {patient.open_alert_count} alert
                  {patient.open_alert_count === 1 ? "" : "s"}
                </span>
              )}

              <ChevronRight
                size={18}
                strokeWidth={2.2}
                style={{ color: "var(--text-soft)" }}
              />
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
