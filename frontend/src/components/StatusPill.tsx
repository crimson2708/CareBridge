import type { HandoffStatus } from "../api/types";

const LABELS: Record<HandoffStatus, { text: string; className: string }> = {
  pending: { text: "Awaiting response", className: "is-pending" },
  accepted: { text: "Accepted", className: "is-accepted" },
  declined: { text: "Declined", className: "is-declined" },
  issue_reported: { text: "Issue reported", className: "is-issue" },
};

export default function StatusPill({ status }: { status: HandoffStatus }) {
  const { text, className } = LABELS[status];
  return <span className={`status-pill ${className}`}>{text}</span>;
}
