"""Thin Supabase helpers.

Uses the *async* Supabase client. An earlier version used the sync client
wrapped in ``asyncio.to_thread``; under concurrent requests that shared one
synchronous httpx connection pool across worker threads, and httpcore's
synchronous HTTP/2 backend is not safe under that use on Windows — it fails
with ``WinError 10035`` and takes every in-flight request on the connection
with it. The async client does real non-blocking I/O on the event loop, so
there is no shared-pool-across-threads problem to have.

This client uses the service_role key and therefore bypasses RLS. Access
control for nurse-facing routes lives in services/auth.py and the route
handlers; the RLS policies are the second line of defence for anything that
talks to Supabase directly.
"""

from datetime import datetime, timezone
from typing import Any, Optional

from supabase import AsyncClient

from config import SUPABASE_KEY, SUPABASE_URL

supabase: AsyncClient = AsyncClient(SUPABASE_URL, SUPABASE_KEY)


async def _exec(query) -> Any:
    return await query.execute()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------------
# staff
# --------------------------------------------------------------------------

async def get_staff(staff_id: str) -> Optional[dict]:
    result = await _exec(
        supabase.table("staff").select("*").eq("id", staff_id).limit(1)
    )
    return result.data[0] if result.data else None


async def list_nurses(exclude_id: Optional[str] = None) -> list[dict]:
    query = (
        supabase.table("staff")
        .select("id, full_name, email, ward")
        .eq("role", "nurse")
        .eq("active", True)
        .order("full_name")
    )
    if exclude_id:
        query = query.neq("id", exclude_id)
    result = await _exec(query)
    return result.data


# --------------------------------------------------------------------------
# shifts
# --------------------------------------------------------------------------

async def get_active_shift(nurse_id: str) -> Optional[dict]:
    result = await _exec(
        supabase.table("shifts")
        .select("*")
        .eq("nurse_id", nurse_id)
        .eq("status", "active")
        .limit(1)
    )
    return result.data[0] if result.data else None


async def create_shift(nurse_id: str) -> dict:
    result = await _exec(
        supabase.table("shifts").insert({"nurse_id": nurse_id, "status": "active"})
    )
    return result.data[0]


async def close_shift(shift_id: str) -> dict:
    result = await _exec(
        supabase.table("shifts")
        .update({"status": "closed", "ended_at": _now()})
        .eq("id", shift_id)
    )
    return result.data[0] if result.data else {}


# --------------------------------------------------------------------------
# patients
# --------------------------------------------------------------------------

_PATIENT_FIELDS = (
    "id, mrn, full_name, ward, bed, status, admitted_at, "
    "assigned_nurse_id, assigned_doctor_id"
)


async def list_patients_for_nurse(nurse_id: str) -> list[dict]:
    result = await _exec(
        supabase.table("patients")
        .select(_PATIENT_FIELDS)
        .eq("assigned_nurse_id", nurse_id)
        .eq("status", "admitted")
        .order("bed")
    )
    return result.data


async def list_patients_for_doctor(doctor_id: str) -> list[dict]:
    result = await _exec(
        supabase.table("patients")
        .select(
            f"{_PATIENT_FIELDS}, "
            "nurse:staff!patients_assigned_nurse_id_fkey(id, full_name)"
        )
        .eq("assigned_doctor_id", doctor_id)
        .eq("status", "admitted")
        .order("bed")
    )
    return result.data


async def get_patient(patient_id: str) -> Optional[dict]:
    result = await _exec(
        supabase.table("patients").select(_PATIENT_FIELDS).eq("id", patient_id).limit(1)
    )
    return result.data[0] if result.data else None


async def reassign_patient(patient_id: str, nurse_id: str) -> None:
    await _exec(
        supabase.table("patients")
        .update({"assigned_nurse_id": nurse_id})
        .eq("id", patient_id)
    )


async def has_pending_handoff_to(patient_id: str, nurse_id: str) -> bool:
    result = await _exec(
        supabase.table("handoffs")
        .select("id")
        .eq("patient_id", patient_id)
        .eq("to_nurse_id", nurse_id)
        .eq("status", "pending")
        .limit(1)
    )
    return bool(result.data)


# --------------------------------------------------------------------------
# patient notes
# --------------------------------------------------------------------------

async def insert_note(
    patient_id: str,
    author_id: str,
    shift_id: Optional[str],
    section: str,
    body: str,
    source: str = "typed",
    raw_transcript: Optional[str] = None,
    stt_confidence: Optional[float] = None,
) -> dict:
    result = await _exec(
        supabase.table("patient_notes").insert(
            {
                "patient_id": patient_id,
                "author_id": author_id,
                "shift_id": shift_id,
                "section": section,
                "body": body,
                "source": source,
                "raw_transcript": raw_transcript,
                "stt_confidence": stt_confidence,
            }
        )
    )
    return result.data[0]


async def list_notes(patient_id: str, section: Optional[str] = None) -> list[dict]:
    query = (
        supabase.table("patient_notes")
        .select("*, author:staff!patient_notes_author_id_fkey(id, full_name)")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
    )
    if section:
        query = query.eq("section", section)
    result = await _exec(query)
    return result.data


async def list_notes_for_handoff(patient_id: str, shift_id: str) -> list[dict]:
    """Notes the outgoing nurse accumulated this shift — the raw material the
    handoff draft is composed from."""
    result = await _exec(
        supabase.table("patient_notes")
        .select("section, body, created_at")
        .eq("patient_id", patient_id)
        .eq("shift_id", shift_id)
        .order("created_at")
    )
    return result.data


async def count_notes_by_patient(patient_ids: list[str]) -> dict[str, dict]:
    """Note count + latest activity per patient, for the My Patients list."""
    if not patient_ids:
        return {}
    result = await _exec(
        supabase.table("patient_notes")
        .select("patient_id, created_at")
        .in_("patient_id", patient_ids)
        .order("created_at", desc=True)
    )
    summary: dict[str, dict] = {}
    for row in result.data:
        entry = summary.setdefault(
            row["patient_id"], {"note_count": 0, "last_note_at": None}
        )
        entry["note_count"] += 1
        # rows arrive newest-first, so the first one seen is the latest
        if entry["last_note_at"] is None:
            entry["last_note_at"] = row["created_at"]
    return summary


# --------------------------------------------------------------------------
# alerts
# --------------------------------------------------------------------------

_ALERT_FIELDS = (
    "*, "
    "patient:patients!alerts_patient_id_fkey(id, full_name, mrn, ward, bed), "
    "raised_by_staff:staff!alerts_raised_by_fkey(id, full_name), "
    "doctor:staff!alerts_doctor_id_fkey(id, full_name)"
)


async def insert_alert(
    patient_id: str, raised_by: str, doctor_id: str, message: Optional[str]
) -> dict:
    result = await _exec(
        supabase.table("alerts").insert(
            {
                "patient_id": patient_id,
                "raised_by": raised_by,
                "doctor_id": doctor_id,
                "message": message,
            }
        )
    )
    return result.data[0]


async def get_alert(alert_id: str) -> Optional[dict]:
    result = await _exec(
        supabase.table("alerts").select(_ALERT_FIELDS).eq("id", alert_id).limit(1)
    )
    return result.data[0] if result.data else None


async def list_alerts_for_patient(patient_id: str) -> list[dict]:
    result = await _exec(
        supabase.table("alerts")
        .select(_ALERT_FIELDS)
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
    )
    return result.data


async def list_open_alerts(doctor_id: str) -> list[dict]:
    result = await _exec(
        supabase.table("alerts")
        .select(_ALERT_FIELDS)
        .eq("doctor_id", doctor_id)
        .eq("status", "open")
        .order("created_at", desc=True)
    )
    return result.data


async def list_acknowledged_alerts(doctor_id: str, limit: int = 30) -> list[dict]:
    result = await _exec(
        supabase.table("alerts")
        .select(_ALERT_FIELDS)
        .eq("doctor_id", doctor_id)
        .eq("status", "acknowledged")
        .order("acknowledged_at", desc=True)
        .limit(limit)
    )
    return result.data


async def acknowledge_alert(alert_id: str) -> dict:
    result = await _exec(
        supabase.table("alerts")
        .update({"status": "acknowledged", "acknowledged_at": _now()})
        .eq("id", alert_id)
        .eq("status", "open")  # the first acknowledgement's time is the one that counts
    )
    return result.data[0] if result.data else {}


# --------------------------------------------------------------------------
# handoffs
# --------------------------------------------------------------------------

_HANDOFF_FIELDS = (
    "*, "
    "patient:patients(id, full_name, mrn, ward, bed), "
    "from_nurse:staff!handoffs_from_nurse_id_fkey(id, full_name), "
    "to_nurse:staff!handoffs_to_nurse_id_fkey(id, full_name)"
)


async def insert_handoffs(rows: list[dict]) -> list[dict]:
    result = await _exec(supabase.table("handoffs").insert(rows))
    return result.data


async def get_handoff(handoff_id: str) -> Optional[dict]:
    result = await _exec(
        supabase.table("handoffs").select(_HANDOFF_FIELDS).eq("id", handoff_id).limit(1)
    )
    return result.data[0] if result.data else None


async def list_inbox(nurse_id: str) -> list[dict]:
    result = await _exec(
        supabase.table("handoffs")
        .select(_HANDOFF_FIELDS)
        .eq("to_nurse_id", nurse_id)
        .eq("status", "pending")
        .order("sent_at", desc=True)
    )
    return result.data


async def list_sent(nurse_id: str, limit: int = 50) -> list[dict]:
    result = await _exec(
        supabase.table("handoffs")
        .select(_HANDOFF_FIELDS)
        .eq("from_nurse_id", nurse_id)
        .order("sent_at", desc=True)
        .limit(limit)
    )
    return result.data


async def respond_to_handoff(
    handoff_id: str, status: str, response_note: Optional[str]
) -> dict:
    result = await _exec(
        supabase.table("handoffs")
        .update(
            {
                "status": status,
                "response_note": response_note,
                "responded_at": _now(),
            }
        )
        .eq("id", handoff_id)
        .eq("status", "pending")  # a handoff is answered once
    )
    return result.data[0] if result.data else {}


async def pending_handoff_patient_ids(nurse_id: str) -> set[str]:
    result = await _exec(
        supabase.table("handoffs")
        .select("patient_id")
        .eq("from_nurse_id", nurse_id)
        .eq("status", "pending")
    )
    return {row["patient_id"] for row in result.data}


async def insert_handoff_event(
    handoff_id: str, actor_id: str, event: str, note: Optional[str] = None
) -> None:
    await _exec(
        supabase.table("handoff_events").insert(
            {
                "handoff_id": handoff_id,
                "actor_id": actor_id,
                "event": event,
                "note": note,
            }
        )
    )


async def list_handoff_events(handoff_id: str) -> list[dict]:
    result = await _exec(
        supabase.table("handoff_events")
        .select("*, actor:staff(id, full_name)")
        .eq("handoff_id", handoff_id)
        .order("created_at")
    )
    return result.data
