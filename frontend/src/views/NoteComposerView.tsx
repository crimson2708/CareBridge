import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Mic,
  RotateCcw,
  Sparkles,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { apiErrorMessage, correctNote, createNote, getPatient } from "../api/client";
import { useAudioRecorder } from "../AudioRecorder";
import type {
  NoteSection,
  PatientDetailResponse,
  TranscribeResponse,
  VoiceLanguage,
} from "../api/types";
import { patientDetailPath } from "../routes";

// Sarvam's synchronous API only takes audio under 30 seconds, so stop just
// before that rather than lose a note she has finished dictating.
const HINDI_MAX_SECONDS = 28;
const LEVEL_BARS = 14;

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
};

/** Mic failures carry a usable message; API failures use the server's detail. */
function voiceErrorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === "NotAllowedError") {
    return "Microphone access was blocked. You can type the note instead.";
  }
  const isPlainError = err instanceof Error && !("isAxiosError" in err);
  return apiErrorMessage(
    err,
    isPlainError ? err.message : "Couldn't transcribe that. You can type the note instead.",
  );
}

export default function NoteComposerView() {
  const { patientId = "" } = useParams();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<PatientDetailResponse | null>(null);
  const [section, setSection] = useState<NoteSection>("detail");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [language, setLanguage] = useState<VoiceLanguage>("en");
  const [transcripts, setTranscripts] = useState<TranscribeResponse[]>([]);
  const [showHeard, setShowHeard] = useState(false);

  const [correcting, setCorrecting] = useState(false);
  const [beforeFix, setBeforeFix] = useState<string | null>(null);
  const [fixMessage, setFixMessage] = useState<string | null>(null);

  // read when a transcript lands, which can be well after recording started
  const bodyRef = useRef(body);
  bodyRef.current = body;

  useEffect(() => {
    let active = true;
    getPatient(patientId)
      .then((detail) => {
        if (active) setPatient(detail);
      })
      .catch((err) => {
        if (active) setError(apiErrorMessage(err, "Couldn't load this patient."));
      });
    return () => {
      active = false;
    };
  }, [patientId]);

  const onTranscribed = useCallback((data: TranscribeResponse) => {
    // only a blank note takes the suggestion, so it can't overrule a choice
    // she has already made while writing
    if (!bodyRef.current.trim()) setSection(data.suggested_section);

    setBody((current) => {
      const existing = current.trimEnd();
      return existing ? `${existing}\n${data.corrected}` : data.corrected;
    });
    setTranscripts((current) => [...current, data]);
    setBeforeFix(null);
    setFixMessage(null);
    setError(null);
  }, []);

  const onVoiceError = useCallback((err: unknown) => {
    setError(voiceErrorMessage(err));
  }, []);

  const { isRecording, isProcessing, recordingDuration, audioLevel, toggleRecording } =
    useAudioRecorder({
      patientId,
      language,
      maxSeconds: language === "hi" ? HINDI_MAX_SECONDS : undefined,
      onSuccess: onTranscribed,
      onError: onVoiceError,
    });

  const voiceBusy = isRecording || isProcessing;
  const lowConfidence = transcripts.some((entry) => entry.low_confidence);

  function onEdit(next: string) {
    setBody(next);
    setBeforeFix(null);
    setFixMessage(null);
  }

  async function onFixSpelling() {
    setCorrecting(true);
    setError(null);
    setFixMessage(null);
    setBeforeFix(null);

    const original = body;
    try {
      const { corrected, changed } = await correctNote(patientId, original);
      if (!changed) {
        setFixMessage("Nothing changed.");
      } else if (bodyRef.current === original) {
        // skip this if she kept typing while the request was running
        setBody(corrected);
        setBeforeFix(original);
      }
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't fix the spelling. Your note is unchanged."));
    } finally {
      setCorrecting(false);
    }
  }

  async function onSave() {
    if (!body.trim()) return;
    setSaving(true);
    setError(null);

    const isVoice = transcripts.length > 0;
    const scores = transcripts
      .map((entry) => entry.confidence)
      .filter((score): score is number => score !== null);

    try {
      await createNote({
        patient_id: patientId,
        section,
        body: body.trim(),
        source: isVoice ? "voice" : "typed",
        raw_transcript: isVoice
          ? transcripts.map((entry) => entry.raw_transcript).join("\n")
          : null,
        stt_confidence: scores.length > 0 ? Math.min(...scores) : null,
      });
      navigate(patientDetailPath(patientId), { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't save the note."));
      setSaving(false);
    }
  }

  return (
    <div className="screen-wrapper">
      <button
        type="button"
        onClick={() => navigate(patientDetailPath(patientId))}
        className="mb-3 flex items-center gap-1.5 text-[0.78rem] font-bold text-[var(--text-muted)]"
      >
        <ArrowLeft size={15} strokeWidth={2.4} />
        Back
      </button>

      <header className="mb-5">
        <h1 className="screen-title">New note</h1>
        <p className="screen-subtitle">{patient?.patient.full_name ?? "…"}</p>
      </header>

      <AnimatePresence>
        {error && (
          <motion.p
            className="form-error mb-4"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <section className="glass-panel p-5">
        <div className="voice-row">
          <button
            type="button"
            className={`voice-button ${isRecording ? "is-recording" : ""}`}
            onClick={toggleRecording}
            disabled={isProcessing || !patient?.is_mine}
            aria-label={isRecording ? "Stop recording" : "Start recording"}
          >
            {isProcessing ? (
              <Loader2 size={20} strokeWidth={2.4} className="animate-spin" />
            ) : isRecording ? (
              <Square size={17} strokeWidth={2.6} />
            ) : (
              <Mic size={20} strokeWidth={2.4} />
            )}
          </button>

          <div className="min-w-0 flex-1" aria-live="polite">
            {isRecording ? (
              <div className="flex items-center gap-3">
                <span className="voice-timer">{formatDuration(recordingDuration)}</span>
                <div className="voice-level" aria-hidden>
                  {Array.from({ length: LEVEL_BARS }).map((_, index) => (
                    <span
                      key={index}
                      style={{
                        height: `${4 + audioLevel * 18 * (1 + Math.sin(index * 0.9)) }px`,
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <p className="voice-hint">
                {isProcessing ? "Transcribing…" : "Tap to dictate this note"}
              </p>
            )}
            {isRecording && language === "hi" && (
              <p className="voice-limit">Stops at {HINDI_MAX_SECONDS} seconds</p>
            )}
          </div>

          <div className="lang-toggle-wrap" role="group" aria-label="Dictation language">
            {(["en", "hi"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`lang-toggle-option ${language === option ? "lang-active" : ""}`}
                onClick={() => setLanguage(option)}
                disabled={voiceBusy}
                aria-pressed={language === option}
              >
                {option === "en" ? "EN" : "हि"}
              </button>
            ))}
          </div>
        </div>

        <p className="field-label mt-5">Section</p>
        <div className="flex gap-2">
          <button
            type="button"
            className={`section-chip ${section === "detail" ? "is-active" : ""}`}
            onClick={() => setSection("detail")}
          >
            Detail
          </button>
          <button
            type="button"
            className={`section-chip ${section === "major_decision" ? "is-active" : ""}`}
            onClick={() => setSection("major_decision")}
          >
            Major decision
          </button>
        </div>
        <p className="mt-2 text-[0.72rem] leading-relaxed text-[var(--text-muted)]">
          Routine observations go under Detail. Anything the next nurse must not
          miss goes under Major decision.
          {transcripts.length > 0 && " Suggested from your dictation, so change it if it's wrong."}
        </p>

        <div className="mt-5 flex items-center justify-between gap-2">
          <label className="field-label mb-0" htmlFor="note-body">
            Note
          </label>
          {lowConfidence && <span className="status-pill is-pending">Check carefully</span>}
        </div>
        <textarea
          id="note-body"
          className="field-textarea mt-1.5"
          rows={8}
          value={body}
          autoFocus
          onChange={(event) => onEdit(event.target.value)}
          placeholder="Dictate or type what the next nurse needs to know."
        />

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            className="note-tool"
            onClick={() => void onFixSpelling()}
            disabled={!body.trim() || correcting || voiceBusy || body.length > 5000}
          >
            <Sparkles size={13} strokeWidth={2.4} />
            {correcting ? "Fixing…" : "Fix spelling"}
          </button>

          {beforeFix !== null && (
            <button
              type="button"
              className="note-tool"
              onClick={() => onEdit(beforeFix)}
            >
              <RotateCcw size={13} strokeWidth={2.4} />
              Undo
            </button>
          )}

          {fixMessage && <span className="voice-hint">{fixMessage}</span>}

          {transcripts.length > 0 && (
            <button
              type="button"
              className="note-tool ml-auto"
              onClick={() => setShowHeard((current) => !current)}
              aria-expanded={showHeard}
            >
              Original transcript
              <motion.span animate={{ rotate: showHeard ? 180 : 0 }} className="inline-flex">
                <ChevronDown size={13} strokeWidth={2.4} />
              </motion.span>
            </button>
          )}
        </div>

        {showHeard && transcripts.length > 0 && (
          <p className="voice-heard">
            {transcripts.map((entry) => entry.raw_transcript).join("\n")}
          </p>
        )}

        <p className="mt-3 text-[0.72rem] leading-relaxed text-[var(--text-muted)]">
          Nothing is saved until you tap Save note, so read it back first.
        </p>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={() => navigate(patientDetailPath(patientId))}
          >
            Discard
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={() => void onSave()}
            disabled={!body.trim() || saving || voiceBusy || correcting || !patient?.is_mine}
          >
            {saving ? "Saving…" : "Save note"}
          </button>
        </div>
      </section>
    </div>
  );
}
