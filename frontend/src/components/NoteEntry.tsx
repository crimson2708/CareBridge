import type { PatientNote } from "../api/types";
import { clockTime, relativeTime } from "../lib/format";

export default function NoteEntry({ note }: { note: PatientNote }) {
  return (
    <article className="note-entry">
      <div className="note-meta">
        <span
          className={
            note.section === "major_decision"
              ? "section-tag is-major"
              : "section-tag is-detail"
          }
        >
          {note.section === "major_decision" ? "Major decision" : "Detail"}
        </span>
        <span>{clockTime(note.created_at)}</span>
        <span>· {relativeTime(note.created_at)}</span>
        {note.author?.full_name && <span>· {note.author.full_name}</span>}
        {note.source === "voice" && <span>· voice</span>}
      </div>
      <p className="note-body">{note.body}</p>
    </article>
  );
}
