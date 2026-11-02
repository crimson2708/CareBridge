import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Inbox, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  apiErrorMessage,
  draftHandoff,
  getInbox,
  getSentHandoffs,
  listMyPatients,
  listNurses,
  sendHandoff,
} from "../api/client";
import SegmentedTabs from "../components/SegmentedTabs";
import StatusPill from "../components/StatusPill";
import type {
  AssignedPatient,
  Handoff,
  HandoffDraft,
  StaffRef,
} from "../api/types";
import { durationBetween, relativeTime } from "../lib/format";
import { handoffReviewPath } from "../routes";

type Tab = "inbox" | "send";
type SendStep = "select" | "review";

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "inbox", label: "Incoming" },
  { value: "send", label: "Send" },
];

export default function HandoffView() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("inbox");

  const [inbox, setInbox] = useState<Handoff[]>([]);
  const [sent, setSent] = useState<Handoff[]>([]);
  const [patients, setPatients] = useState<AssignedPatient[]>([]);
  const [nurses, setNurses] = useState<StaffRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // send flow
  const [step, setStep] = useState<SendStep>("select");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<HandoffDraft[]>([]);
  const [recipient, setRecipient] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [inboxRes, sentRes, patientsRes, nursesRes] = await Promise.all([
        getInbox(),
        getSentHandoffs(),
        listMyPatients(),
        listNurses(),
      ]);
      setInbox(inboxRes.handoffs);
      setSent(sentRes.handoffs);
      setPatients(patientsRes.patients);
      setNurses(nursesRes.nurses);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load handoffs."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(patientId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(patientId)) next.delete(patientId);
      else next.add(patientId);
      return next;
    });
  }

  async function onBuildDrafts() {
    setBusy(true);
    setError(null);
    try {
      const { drafts: built } = await draftHandoff([...selected]);
      setDrafts(built);
      setStep("review");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't build the handoff drafts."));
    } finally {
      setBusy(false);
    }
  }

  async function onSend() {
    setBusy(true);
    setError(null);
    try {
      const result = await sendHandoff({
        to_nurse_id: recipient,
        items: drafts.map((draft) => ({
          patient_id: draft.patient.id,
          details: draft.details,
          major_decisions: draft.major_decisions,
        })),
      });
      setSuccess(
        `${result.count} patient${result.count === 1 ? "" : "s"} handed to ${result.sent_to}.`,
      );
      setSelected(new Set());
      setDrafts([]);
      setRecipient("");
      setStep("select");
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't send the handoff."));
    } finally {
      setBusy(false);
    }
  }

  function updateDraft(patientId: string, patch: Partial<HandoffDraft>) {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.patient.id === patientId ? { ...draft, ...patch } : draft,
      ),
    );
  }

  return (
    <div className="screen-wrapper">
      <header className="screen-header">
        <div>
          <h1 className="screen-title">Handoff</h1>
          <p className="screen-subtitle">
            {inbox.length} awaiting your response
          </p>
        </div>
      </header>

      <SegmentedTabs value={tab} onChange={setTab} options={TABS} layoutId="handoff-tabs" />

      {error && <p className="form-error mt-4">{error}</p>}
      {success && <p className="form-success mt-4">{success}</p>}

      {loading ? (
        <div className="mt-4 space-y-3">
          {[0, 1].map((index) => (
            <div key={index} className="skeleton-row" />
          ))}
        </div>
      ) : tab === "inbox" ? (
        <div className="mt-4 space-y-3">
          {inbox.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon">
                <Inbox size={22} strokeWidth={2.2} />
              </span>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Nothing waiting on you
              </p>
              <p className="max-w-xs text-[0.8rem]">
                Handoffs sent to you appear here. Open one to read it before
                accepting.
              </p>
            </div>
          ) : (
            inbox.map((handoff, index) => (
              <motion.button
                key={handoff.id}
                type="button"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.32 }}
                className="handoff-card"
                onClick={() => navigate(handoffReviewPath(handoff.id))}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="patient-name">
                      {handoff.patient?.full_name ?? "Patient"}
                    </p>
                    <p className="patient-meta">
                      Bed {handoff.patient?.bed ?? "—"} · from{" "}
                      {handoff.from_nurse?.full_name ?? "a colleague"} ·{" "}
                      {relativeTime(handoff.sent_at)}
                    </p>
                  </div>
                  <StatusPill status={handoff.status} />
                </div>
                <p className="mt-3 line-clamp-2 text-[0.82rem] text-[var(--text-muted)]">
                  {handoff.details || "No details written."}
                </p>
                <span
                  className="mt-3 inline-flex items-center gap-1 text-[0.74rem] font-bold"
                  style={{ color: "var(--primary-contrast)" }}
                >
                  Read and respond
                  <ArrowRight size={13} strokeWidth={2.5} />
                </span>
              </motion.button>
            ))
          )}

          {sent.length > 0 && (
            <section className="pt-4">
              <p className="section-title mb-2">Handoffs you sent</p>
              <div className="space-y-2">
                {sent.slice(0, 6).map((handoff) => {
                  const tta = durationBetween(handoff.sent_at, handoff.responded_at);
                  return (
                    <div
                      key={handoff.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3"
                      style={{
                        borderColor: "var(--c12)",
                        background: "rgba(255,255,255,0.6)",
                      }}
                    >
                      <div className="min-w-0">
                        <p className="text-[0.85rem] font-bold text-[var(--text-primary)]">
                          {handoff.patient?.full_name ?? "Patient"}
                        </p>
                        <p className="text-[0.72rem] text-[var(--text-muted)]">
                          to {handoff.to_nurse?.full_name ?? "—"} ·{" "}
                          {tta ? `answered in ${tta}` : relativeTime(handoff.sent_at)}
                        </p>
                        {handoff.response_note && (
                          <p className="mt-1 text-[0.72rem] italic text-[var(--text-muted)]">
                            “{handoff.response_note}”
                          </p>
                        )}
                      </div>
                      <StatusPill status={handoff.status} />
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <AnimatePresence mode="wait">
            {step === "select" ? (
              <motion.div
                key="select"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="space-y-3"
              >
                <p className="section-title">Choose who to hand over</p>

                {patients.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-state-icon">
                      <Send size={22} strokeWidth={2.2} />
                    </span>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      No patients to hand off
                    </p>
                  </div>
                ) : (
                  patients.map((patient) => {
                    const isSelected = selected.has(patient.id);
                    return (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => toggle(patient.id)}
                        className={`patient-row ${isSelected ? "is-selected" : ""}`}
                        aria-pressed={isSelected}
                      >
                        <span className="patient-bed">{patient.bed ?? "—"}</span>
                        <span className="min-w-0 flex-1">
                          <p className="patient-name">{patient.full_name}</p>
                          <p className="patient-meta">
                            {patient.note_count} note
                            {patient.note_count === 1 ? "" : "s"} this stay
                          </p>
                        </span>
                        <span
                          className="grid h-6 w-6 place-items-center rounded-full border"
                          style={{
                            borderColor: isSelected ? "var(--c70)" : "var(--c20)",
                            background: isSelected ? "var(--primary)" : "transparent",
                            color: "#fff",
                          }}
                        >
                          {isSelected && <Check size={14} strokeWidth={3} />}
                        </span>
                      </button>
                    );
                  })
                )}

                <button
                  type="button"
                  className="btn-primary w-full"
                  disabled={selected.size === 0 || busy}
                  onClick={() => void onBuildDrafts()}
                >
                  {busy
                    ? "Summarising…"
                    : `Prepare handoff for ${selected.size || ""} patient${
                        selected.size === 1 ? "" : "s"
                      }`}
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="review"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="space-y-4"
              >
                <p className="section-title">Review before sending</p>
                <p className="text-[0.78rem] text-[var(--text-muted)]">
                  Drafted from your notes this shift. Edit anything that isn't right.
                  This is what the next nurse will read.
                </p>

                {drafts.map((draft) => (
                  <section key={draft.patient.id} className="glass-panel p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="patient-name">{draft.patient.full_name}</p>
                        <p className="patient-meta">
                          Bed {draft.patient.bed ?? "—"} · {draft.note_count} note
                          {draft.note_count === 1 ? "" : "s"}
                        </p>
                      </div>
                      {draft.note_count === 0 && (
                        <span className="status-pill is-pending">No notes yet</span>
                      )}
                    </div>

                    {draft.ai_generated && (
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="status-pill is-pending">
                          AI summary, check against your notes
                        </span>
                        <button
                          type="button"
                          className="note-tool"
                          onClick={() =>
                            updateDraft(draft.patient.id, {
                              details: draft.source_details,
                              major_decisions: draft.source_major_decisions,
                              ai_generated: false,
                            })
                          }
                        >
                          Use my notes as written
                        </button>
                      </div>
                    )}

                    <label className="field-label" htmlFor={`d-${draft.patient.id}`}>
                      Details
                    </label>
                    <textarea
                      id={`d-${draft.patient.id}`}
                      className="field-textarea"
                      rows={4}
                      value={draft.details}
                      onChange={(event) =>
                        updateDraft(draft.patient.id, { details: event.target.value })
                      }
                    />

                    <label
                      className="field-label mt-3"
                      htmlFor={`m-${draft.patient.id}`}
                    >
                      Major decisions
                    </label>
                    <textarea
                      id={`m-${draft.patient.id}`}
                      className="field-textarea"
                      rows={3}
                      value={draft.major_decisions}
                      onChange={(event) =>
                        updateDraft(draft.patient.id, {
                          major_decisions: event.target.value,
                        })
                      }
                    />
                  </section>
                ))}

                <div>
                  <label className="field-label" htmlFor="recipient">
                    Hand over to
                  </label>
                  <select
                    id="recipient"
                    className="field-input"
                    value={recipient}
                    onChange={(event) => setRecipient(event.target.value)}
                  >
                    <option value="">Select a nurse…</option>
                    {nurses.map((nurse) => (
                      <option key={nurse.id} value={nurse.id}>
                        {nurse.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    className="btn-secondary flex-1"
                    onClick={() => setStep("select")}
                    disabled={busy}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn-primary flex-1"
                    onClick={() => void onSend()}
                    disabled={!recipient || busy}
                  >
                    {busy ? "Sending…" : "Send handoff"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
