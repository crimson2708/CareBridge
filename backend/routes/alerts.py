"""The nurse's side of escalation: raise an alert, and see whether it was seen."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from services.access import ensure_assigned_patient, ensure_can_view_patient
from services.auth import get_current_nurse
from services.db import get_staff, insert_alert, list_alerts_for_patient

router = APIRouter()


class RaiseAlertRequest(BaseModel):
    patient_id: str
    message: Optional[str] = Field(default=None, max_length=500)


@router.post("")
async def raise_alert(req: RaiseAlertRequest, nurse: dict = Depends(get_current_nurse)):
    patient = await ensure_assigned_patient(req.patient_id, nurse)

    # the doctor comes from the patient record, so an alert can't be misdirected,
    # and one sent to a deactivated account would never be read by anyone
    doctor_id = patient.get("assigned_doctor_id")
    doctor = await get_staff(doctor_id) if doctor_id else None
    if not doctor or doctor["role"] != "doctor" or not doctor["active"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This patient has no active doctor to alert. Escalate in person.",
        )

    message = (req.message or "").strip() or None
    alert = await insert_alert(patient["id"], nurse["id"], doctor["id"], message)
    return {"alert": alert, "sent_to": doctor["full_name"]}


@router.get("/patient/{patient_id}")
async def alerts_for_patient(
    patient_id: str, nurse: dict = Depends(get_current_nurse)
):
    await ensure_can_view_patient(patient_id, nurse)
    alerts = await list_alerts_for_patient(patient_id)
    return {"alerts": alerts, "count": len(alerts)}
