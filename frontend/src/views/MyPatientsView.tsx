import { motion } from "framer-motion";
import { ChevronRight, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiErrorMessage, listMyPatients } from "../api/client";
import type { AssignedPatient } from "../api/types";
import { relativeTime } from "../lib/format";
import { fadeUp } from "../lib/motion";
import { patientDetailPath } from "../routes";

export default function MyPatientsView() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<AssignedPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { patients: rows } = await listMyPatients();
      setPatients(rows);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load your patients."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      ) : patients.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">
            <Users size={24} strokeWidth={2.2} />
          </span>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            No patients assigned
          </p>
          <p className="max-w-xs text-[0.8rem]">
            Patients appear here once they're assigned to you, or once you accept a
            handoff.
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
              onClick={() => navigate(patientDetailPath(patient.id))}
            >
              <span className="patient-bed">{patient.bed ?? "—"}</span>

              <span className="min-w-0 flex-1">
                <p className="patient-name">{patient.full_name}</p>
                <p className="patient-meta">
                  {patient.mrn}
                  {" · "}
                  {patient.note_count} note{patient.note_count === 1 ? "" : "s"}
                  {patient.last_note_at
                    ? ` · last ${relativeTime(patient.last_note_at)}`
                    : " · no notes yet"}
                </p>
              </span>

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
