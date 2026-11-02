from fastapi import APIRouter, Depends

from services.access import ensure_can_view_patient
from services.auth import get_current_nurse
from services.db import (
    count_notes_by_patient,
    get_staff,
    list_patients_for_nurse,
)

router = APIRouter()


@router.get("/mine")
async def my_patients(nurse: dict = Depends(get_current_nurse)):
    """The doc's 'her own patient view' — only the patients under her care."""
    patients = await list_patients_for_nurse(nurse["id"])
    patient_ids = [p["id"] for p in patients]

    note_summary = await count_notes_by_patient(patient_ids)

    for patient in patients:
        summary = note_summary.get(patient["id"], {})
        patient["note_count"] = summary.get("note_count", 0)
        patient["last_note_at"] = summary.get("last_note_at")

    return {"patients": patients, "count": len(patients)}


@router.get("/{patient_id}")
async def patient_detail(patient_id: str, nurse: dict = Depends(get_current_nurse)):
    patient = await ensure_can_view_patient(patient_id, nurse)

    doctor = None
    if patient.get("assigned_doctor_id"):
        doctor = await get_staff(patient["assigned_doctor_id"])
        if doctor:
            doctor = {"id": doctor["id"], "full_name": doctor["full_name"]}

    return {
        "patient": patient,
        "doctor": doctor,
        "is_mine": patient["assigned_nurse_id"] == nurse["id"],
    }
