from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field

from config import REVIEW_CONFIDENCE_THRESHOLD
from services.access import ensure_assigned_patient, ensure_can_view_patient
from services.auth import get_current_nurse
from services.db import get_active_shift, insert_note, list_notes
from services.groq_llm import correct_note
from services.stt import TranscriptionUnavailable, transcribe_audio

router = APIRouter()

Section = Literal["detail", "major_decision"]

MAX_AUDIO_BYTES = 25 * 1024 * 1024


class CreateNoteRequest(BaseModel):
    patient_id: str
    section: Section
    body: str = Field(min_length=1)
    source: Literal["voice", "typed"] = "typed"
    raw_transcript: Optional[str] = None
    stt_confidence: Optional[float] = Field(default=None, ge=0, le=1)


class CorrectNoteRequest(BaseModel):
    patient_id: str
    text: str = Field(min_length=1, max_length=5000)


@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    patient_id: str = Form(...),
    language: Literal["en", "hi"] = Form(default="en"),
    nurse: dict = Depends(get_current_nurse),
):
    """Voice note -> editable draft. Deliberately writes nothing.

    Nothing reaches the record until the nurse has read it back and saved it
    through POST /, so a transcription error can't get there unreviewed.
    """
    await ensure_assigned_patient(patient_id, nurse)

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="The recording was empty."
        )
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=413,
            detail="That recording is too long. Try a shorter note.",
        )

    try:
        result = await transcribe_audio(audio_bytes, language)
    except TranscriptionUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Voice notes are unavailable right now. Please type the note instead.",
        )

    raw_transcript = result["transcript"]
    if not raw_transcript:
        raise HTTPException(
            status_code=422,
            detail="No speech was detected. Try recording again.",
        )

    correction = await correct_note(raw_transcript)
    confidence = result["confidence"]

    return {
        "raw_transcript": raw_transcript,
        "corrected": correction["corrected"],
        "suggested_section": correction["section"],
        "confidence": confidence,
        "low_confidence": confidence is not None
        and confidence < REVIEW_CONFIDENCE_THRESHOLD,
        "saved": False,
    }


@router.post("/correct")
async def correct(req: CorrectNoteRequest, nurse: dict = Depends(get_current_nurse)):
    """The Fix spelling button. Returns a suggestion and writes nothing."""
    await ensure_assigned_patient(req.patient_id, nurse)

    correction = await correct_note(req.text)
    if not correction["ok"]:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Fix spelling is unavailable right now. Your note is unchanged.",
        )

    return {
        "corrected": correction["corrected"],
        "changed": correction["corrected"] != req.text,
    }


@router.post("")
async def create_note(
    req: CreateNoteRequest, nurse: dict = Depends(get_current_nurse)
):
    """Record a note the nurse has read and approved."""
    await ensure_assigned_patient(req.patient_id, nurse)

    body = req.body.strip()
    if not body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Note body is empty."
        )

    shift = await get_active_shift(nurse["id"])
    is_voice = req.source == "voice"

    note = await insert_note(
        patient_id=req.patient_id,
        author_id=nurse["id"],
        shift_id=shift["id"] if shift else None,
        section=req.section,
        body=body,
        source=req.source,
        raw_transcript=req.raw_transcript if is_voice else None,
        stt_confidence=req.stt_confidence if is_voice else None,
    )
    return {"note": note}


@router.get("/patient/{patient_id}")
async def notes_for_patient(
    patient_id: str,
    section: Optional[Section] = Query(default=None),
    nurse: dict = Depends(get_current_nurse),
):
    """The full log, and the two section views, from one endpoint."""
    await ensure_can_view_patient(patient_id, nurse)
    notes = await list_notes(patient_id, section)
    return {"notes": notes, "count": len(notes)}
