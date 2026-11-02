import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  acceptHandoff,
  apiErrorMessage,
  declineHandoff,
  getHandoff,
  reportHandoffIssue,
} from "../api/client";
import BottomSheet from "../components/BottomSheet";
import SegmentedTabs from "../components/SegmentedTabs";
import StatusPill from "../components/StatusPill";
import type { HandoffDetailResponse } from "../api/types";
import { clockTime, relativeTime } from "../lib/format";

type Tab = "details" | "major" | "log";
type Action = "decline" | "issue";

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "details", label: "Details" },
  { value: "major", label: "Major Decisions" },
  { value: "log", label: "See Log" },
];

const ACTION_COPY: Record<Action, { title: string; hint: string; cta: string }> = {
  decline: {
    title: "Decline this handoff",
    hint: "The patient goes back to the sending nurse. Say why, so they can fix it or send it to the right person.",
    cta: "Decline and send back",
  },
  issue: {
    title: "Report an issue",
    hint: "The patient still comes to you, but the problem is recorded for the sender to sort out. Describe what's wrong or unclear.",
    cta: "Accept with issue",
  },
};

export default function HandoffReviewView() {
  const { handoffId = "" } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState<HandoffDetailResponse | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [sheet, setSheet] = useState<Action | null>(null);
  const [note, setNote] = useState("");

  // opening the handoff is itself recorded, so "she read it first" is checkable
  const load = useCallback(async () => {
    try {
      setData(await getHandoff(handoffId));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load this handoff."));
    } finally {
      setLoading(false);
    }
  }, [handoffId]);

  useEffect(() => {
    void load();
  }, [load]);

  const majorDecisionNotes = useMemo(
    () => data?.notes.filter((entry) => entry.section === "major_decision") ?? [],
    [data],
  );

  async function respond(action: "accept" | Action) {
    setBusy(true);
    setError(null);
    try {
      if (action === "accept") await acceptHandoff(handoffId);
      else if (action === "decline") await declineHandoff(handoffId, note.trim());
      else await reportHandoffIssue(handoffId, note.trim());

      setSheet(null);
      setNote("");
      navigate("/handoff", { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't record your response."));
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="screen-wrapper flex items-center justify-center">
        <div className="loading-pulse" aria-label="Loading" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="screen-wrapper">
        <button type="button" className="btn-secondary mb-4" onClick={() => navigate(-1)}>
          Back
        </button>
        <p className="form-error">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { handoff, notes } = data;
  const isPending = handoff.status === "pending";

  return (
    <div className="screen-wrapper">
      <button
        type="button"
        onClick={() => navigate("/handoff")}
        className="mb-3 flex items-center gap-1.5 text-[0.78rem] font-bold text-[var(--text-muted)]"
      >
        <ArrowLeft size={15} strokeWidth={2.4} />
        Handoff
      </button>

      <header className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="screen-title">{handoff.patient?.full_name ?? "Patient"}</h1>
            <p className="screen-subtitle">
              Bed {handoff.patient?.bed ?? "—"} · {handoff.patient?.mrn ?? ""}
            </p>
          </div>
          <StatusPill status={handoff.status} />
        </div>
        <p className="mt-2 text-[0.78rem] text-[var(--text-muted)]">
          From {handoff.from_nurse?.full_name ?? "a colleague"} ·{" "}
          {relativeTime(handoff.sent_at)}
        </p>
      </header>

      {error && <p className="form-error mb-4">{error}</p>}

      {handoff.response_note && (
        <p className="form-error mb-4">
          Response recorded: “{handoff.response_note}”
        </p>
      )}

      <SegmentedTabs
        value={tab}
        onChange={setTab}
        options={TABS}
        layoutId="handoff-review-tabs"
      />

      <div className="mt-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {tab === "details" && (
              <section className="glass-panel p-5">
                <p className="section-title mb-2">Details</p>
                <p className="handoff-prose">
                  {handoff.details?.trim() || "The sending nurse left this blank."}
                </p>
              </section>
            )}

            {tab === "major" && (
              <div className="space-y-3">
                <section className="glass-panel p-5">
                  <p className="section-title mb-2">Major decisions</p>
                  <p className="handoff-prose">
                    {handoff.major_decisions?.trim() ||
                      "The sending nurse left this blank."}
                  </p>
                </section>

                {majorDecisionNotes.length > 0 && (
                  <section>
                    <p className="section-title mb-2">Recorded during the shift</p>
                    <div className="space-y-2">
                      {majorDecisionNotes.map((entry) => (
                        <article key={entry.id} className="note-entry">
                          <div className="note-meta">
                            <span className="section-tag is-major">Major decision</span>
                            <span>{clockTime(entry.created_at)}</span>
                            {entry.author?.full_name && (
                              <span>· {entry.author.full_name}</span>
                            )}
                            {entry.source === "voice" && <span>· voice</span>}
                          </div>
                          <p className="note-body">{entry.body}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            {tab === "log" && (
              <div className="space-y-2">
                {notes.length === 0 ? (
                  <div className="empty-state">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      Nothing logged for this patient
                    </p>
                  </div>
                ) : (
                  notes.map((entry) => (
                    <article key={entry.id} className="note-entry">
                      <div className="note-meta">
                        <span
                          className={
                            entry.section === "major_decision"
                              ? "section-tag is-major"
                              : "section-tag is-detail"
                          }
                        >
                          {entry.section === "major_decision"
                            ? "Major decision"
                            : "Detail"}
                        </span>
                        <span>{clockTime(entry.created_at)}</span>
                        <span>· {relativeTime(entry.created_at)}</span>
                        {entry.author?.full_name && <span>· {entry.author.full_name}</span>}
                        {entry.source === "voice" && <span>· voice</span>}
                      </div>
                      <p className="note-body">{entry.body}</p>
                    </article>
                  ))
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {isPending && (
        <div className="mt-6 space-y-3">
          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => void respond("accept")}
            disabled={busy}
          >
            {busy ? "Working…" : "Accept patient"}
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setSheet("issue")}
              disabled={busy}
            >
              Report issue
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => setSheet("decline")}
              disabled={busy}
            >
              Decline
            </button>
          </div>
        </div>
      )}

      <BottomSheet
        open={sheet !== null}
        title={sheet ? ACTION_COPY[sheet].title : ""}
        onClose={() => setSheet(null)}
      >
        {sheet && (
          <>
            <p className="mb-3 text-[0.8rem] text-[var(--text-muted)]">
              {ACTION_COPY[sheet].hint}
            </p>
            <label className="field-label" htmlFor="response-note">
              Reason (required)
            </label>
            <textarea
              id="response-note"
              className="field-textarea"
              rows={4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                sheet === "decline"
                  ? "e.g. This patient isn't in my bay — should go to Ward 4."
                  : "e.g. No mention of whether the 18:00 antibiotic was given."
              }
            />
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={() => setSheet(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={sheet === "decline" ? "btn-danger flex-1" : "btn-primary flex-1"}
                onClick={() => void respond(sheet)}
                disabled={busy || note.trim().length === 0}
              >
                {busy ? "Working…" : ACTION_COPY[sheet].cta}
              </button>
            </div>
          </>
        )}
      </BottomSheet>
    </div>
  );
}
