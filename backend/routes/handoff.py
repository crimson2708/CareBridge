"""Per-patient handoff.

A handoff is per patient, sent to a chosen nurse, and answered with Accept,
Decline, or Report an Issue. An earlier version wrote one handoff per *shift*
covering every patient, with no named recipient and no way to push back —
which made declining or disputing a single patient impossible.
"""

import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from services.access import ensure_assigned_patient
from services.auth import get_current_nurse
from services.db import (
    get_active_shift,
    get_handoff,
    get_patient,
    get_staff,
    insert_handoff_event,
    insert_handoffs,
    list_handoff_events,
    list_inbox,
    list_notes,
    list_notes_for_handoff,
    list_sent,
    reassign_patient,
    respond_to_handoff,
)
from services.groq_llm import summarise_handoff

router = APIRouter()


class DraftRequest(BaseModel):
    patient_ids: list[str] = Field(min_length=1)


class HandoffItem(BaseModel):
    patient_id: str
    details: str = ""
    major_decisions: str = ""


class SendRequest(BaseModel):
    to_nurse_id: str
    items: list[HandoffItem] = Field(min_length=1)


class ResponseNote(BaseModel):
    note: str = Field(min_length=1)


# --------------------------------------------------------------------------
# composing and sending
# --------------------------------------------------------------------------

@router.post("/draft")
async def draft_handoff(req: DraftRequest, nurse: dict = Depends(get_current_nurse)):
    """Summarise the notes she wrote this shift into an editable draft per
    selected patient. Saves nothing — she reviews and edits before sending, and
    her notes come back too so she can check the summary against them."""
    shift = await get_active_shift(nurse["id"])
    shift_id = shift["id"] if shift else None

    async def draft_for(patient_id: str) -> dict:
        patient = await ensure_assigned_patient(patient_id, nurse)
        # no open shift means nothing to summarise, never the patient's whole history
        notes = await list_notes_for_handoff(patient_id, shift_id) if shift_id else []
        summary = await summarise_handoff(notes)

        def section_text(section: str) -> str:
            return "\n".join(
                note["body"] for note in notes if note.get("section") == section
            )

        return {
            "patient": {
                "id": patient["id"],
                "full_name": patient["full_name"],
                "bed": patient["bed"],
                "mrn": patient["mrn"],
            },
            "details": summary["details"],
            "major_decisions": summary["major_decisions"],
            "ai_generated": summary["generated"],
            "source_details": section_text("detail"),
            "source_major_decisions": section_text("major_decision"),
            "note_count": len(notes),
        }

    drafts = await asyncio.gather(*(draft_for(pid) for pid in req.patient_ids))
    return {"drafts": list(drafts)}


@router.post("/send")
async def send_handoff(req: SendRequest, nurse: dict = Depends(get_current_nurse)):
    if req.to_nurse_id == nurse["id"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot hand a patient off to yourself.",
        )

    recipient = await get_staff(req.to_nurse_id)
    if not recipient or recipient["role"] != "nurse" or not recipient["active"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The selected recipient is not an active nurse.",
        )

    shift = await get_active_shift(nurse["id"])

    rows = []
    for item in req.items:
        await ensure_assigned_patient(item.patient_id, nurse)
        rows.append(
            {
                "patient_id": item.patient_id,
                "from_nurse_id": nurse["id"],
                "to_nurse_id": req.to_nurse_id,
                "from_shift_id": shift["id"] if shift else None,
                "details": item.details.strip(),
                "major_decisions": item.major_decisions.strip(),
                "status": "pending",
            }
        )

    try:
        created = await insert_handoffs(rows)
    except Exception as exc:
        # the partial unique index refuses a second pending handoff per patient
        if "handoffs_one_pending_per_patient" in str(exc):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="One of these patients already has a handoff awaiting a response.",
            )
        raise

    await asyncio.gather(
        *(
            insert_handoff_event(row["id"], nurse["id"], "sent")
            for row in created
        )
    )

    return {"handoffs": created, "count": len(created), "sent_to": recipient["full_name"]}


# --------------------------------------------------------------------------
# reading
# --------------------------------------------------------------------------

@router.get("/inbox")
async def inbox(nurse: dict = Depends(get_current_nurse)):
    handoffs = await list_inbox(nurse["id"])
    return {"handoffs": handoffs, "count": len(handoffs)}


@router.get("/sent")
async def sent(nurse: dict = Depends(get_current_nurse)):
    """So the outgoing nurse can see what was accepted, declined, or disputed."""
    handoffs = await list_sent(nurse["id"])
    return {"handoffs": handoffs, "count": len(handoffs)}


async def _load_for_recipient(handoff_id: str, nurse: dict) -> dict:
    handoff = await get_handoff(handoff_id)
    if not handoff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Handoff not found."
        )
    if handoff["to_nurse_id"] != nurse["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This handoff was not sent to you.",
        )
    return handoff


@router.get("/{handoff_id}")
async def handoff_detail(handoff_id: str, nurse: dict = Depends(get_current_nurse)):
    """Details, Major Decisions, and the patient's full log — the three things
    the incoming nurse is expected to read before answering."""
    handoff = await get_handoff(handoff_id)
    if not handoff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Handoff not found."
        )
    if nurse["id"] not in (handoff["to_nurse_id"], handoff["from_nurse_id"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not your handoff."
        )

    notes = await list_notes(handoff["patient_id"])
    events = await list_handoff_events(handoff_id)

    # record that the recipient actually opened it — this is what makes
    # "she read it before acting" auditable rather than assumed
    if handoff["to_nurse_id"] == nurse["id"] and handoff["status"] == "pending":
        await insert_handoff_event(handoff_id, nurse["id"], "viewed")

    return {"handoff": handoff, "notes": notes, "events": events}


# --------------------------------------------------------------------------
# responding
# --------------------------------------------------------------------------

async def _respond(
    handoff_id: str,
    nurse: dict,
    new_status: str,
    note: Optional[str],
    transfer_patient: bool,
) -> dict:
    handoff = await _load_for_recipient(handoff_id, nurse)
    if handoff["status"] != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This handoff was already {handoff['status'].replace('_', ' ')}.",
        )

    updated = await respond_to_handoff(handoff_id, new_status, note)
    if not updated:
        # someone answered it between the read and the write
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This handoff was already answered.",
        )

    if transfer_patient:
        await reassign_patient(handoff["patient_id"], nurse["id"])

    await insert_handoff_event(handoff_id, nurse["id"], new_status, note)
    return updated


@router.post("/{handoff_id}/accept")
async def accept(handoff_id: str, nurse: dict = Depends(get_current_nurse)):
    updated = await _respond(handoff_id, nurse, "accepted", None, transfer_patient=True)
    return {"handoff": updated, "message": "Patient accepted into your care."}


@router.post("/{handoff_id}/decline")
async def decline(
    handoff_id: str, req: ResponseNote, nurse: dict = Depends(get_current_nurse)
):
    """Wrong recipient, or too much missing. The patient stays with the sender."""
    updated = await _respond(
        handoff_id, nurse, "declined", req.note.strip(), transfer_patient=False
    )
    return {"handoff": updated, "message": "Handoff declined and sent back."}


@router.post("/{handoff_id}/report-issue")
async def report_issue(
    handoff_id: str, req: ResponseNote, nurse: dict = Depends(get_current_nurse)
):
    """Something is wrong or unclear, but it still needs sorting out rather
    than bouncing back. Care transfers so the patient is never left unattended;
    the issue stays on the record for the sender to resolve."""
    updated = await _respond(
        handoff_id, nurse, "issue_reported", req.note.strip(), transfer_patient=True
    )
    return {
        "handoff": updated,
        "message": "Issue reported. The patient is now under your care and the sender has been notified.",
    }
