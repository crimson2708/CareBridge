"""The doctor's screen: their patients, each patient's log across every nurse and
shift, and the alerts raised to them. Doctors read the record; only nurses write
to it, so the one action here is acknowledging an alert."""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, status

from services.access import ensure_doctor_patient
from services.auth import get_current_doctor
from services.db import (
    acknowledge_alert,
    count_notes_by_patient,
    get_alert,
    get_staff,
    list_acknowledged_alerts,
    list_alerts_for_patient,
    list_notes,
    list_open_alerts,
    list_patients_for_doctor,
)

router = APIRouter()


@router.get("/patients")
async def my_patients(doctor: dict = Depends(get_current_doctor)):
    patients, open_alerts = await asyncio.gather(
        list_patients_for_doctor(doctor["id"]),
        list_open_alerts(doctor["id"]),
    )
    note_summary = await count_notes_by_patient([p["id"] for p in patients])

    open_by_patient: dict[str, int] = {}
    for alert in open_alerts:
        open_by_patient[alert["patient_id"]] = open_by_patient.get(alert["patient_id"], 0) + 1

    for patient in patients:
        summary = note_summary.get(patient["id"], {})
        patient["note_count"] = summary.get("note_count", 0)
        patient["last_note_at"] = summary.get("last_note_at")
        patient["open_alert_count"] = open_by_patient.get(patient["id"], 0)

    # sorted() is stable, so patients with nothing open stay in bed order
    patients = sorted(patients, key=lambda p: p["open_alert_count"] == 0)
    return {"patients": patients, "count": len(patients)}


@router.get("/patients/{patient_id}")
async def patient_detail(patient_id: str, doctor: dict = Depends(get_current_doctor)):
    patient = await ensure_doctor_patient(patient_id, doctor)

    notes, alerts = await asyncio.gather(
        list_notes(patient_id),
        list_alerts_for_patient(patient_id),
    )

    nurse = None
    if patient.get("assigned_nurse_id"):
        nurse = await get_staff(patient["assigned_nurse_id"])
        if nurse:
            nurse = {"id": nurse["id"], "full_name": nurse["full_name"]}

    return {"patient": patient, "nurse": nurse, "notes": notes, "alerts": alerts}


@router.get("/alerts")
async def my_alerts(doctor: dict = Depends(get_current_doctor)):
    open_alerts, acknowledged = await asyncio.gather(
        list_open_alerts(doctor["id"]),
        list_acknowledged_alerts(doctor["id"]),
    )
    return {
        "open": open_alerts,
        "acknowledged": acknowledged,
        "open_count": len(open_alerts),
    }


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge(alert_id: str, doctor: dict = Depends(get_current_doctor)):
    alert = await get_alert(alert_id)
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found."
        )
    if alert["doctor_id"] != doctor["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This alert was not sent to you.",
        )

    updated = await acknowledge_alert(alert_id)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This alert was already acknowledged.",
        )
    return {"alert": updated}
