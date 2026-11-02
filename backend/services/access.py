"""Patient-level access checks shared by the nurse and doctor routes."""

from fastapi import HTTPException, status

from services.db import get_patient, has_pending_handoff_to


async def ensure_can_view_patient(patient_id: str, nurse: dict) -> dict:
    """A nurse may read a patient she is assigned, or one being handed to her —
    she has to read Details, Major Decisions and the Log *before* deciding
    whether to accept."""
    patient = await get_patient(patient_id)
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found."
        )

    if patient["assigned_nurse_id"] == nurse["id"]:
        return patient
    if await has_pending_handoff_to(patient_id, nurse["id"]):
        return patient

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="This patient is not under your care.",
    )


async def ensure_assigned_patient(patient_id: str, nurse: dict) -> dict:
    """Writes require the patient to actually be hers right now."""
    patient = await get_patient(patient_id)
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found."
        )
    if patient["assigned_nurse_id"] != nurse["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This patient is not under your care.",
        )
    return patient


async def ensure_doctor_patient(patient_id: str, doctor: dict) -> dict:
    """A doctor reads the patients assigned to them, and no others."""
    patient = await get_patient(patient_id)
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found."
        )
    if patient["assigned_doctor_id"] != doctor["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This patient is not assigned to you.",
        )
    return patient
