from fastapi import APIRouter, Depends, HTTPException, status

from services.auth import get_current_nurse
from services.db import (
    close_shift,
    create_shift,
    get_active_shift,
    list_patients_for_nurse,
    pending_handoff_patient_ids,
)

router = APIRouter()


@router.get("/current")
async def current_shift(nurse: dict = Depends(get_current_nurse)):
    """Returns the open shift, opening one if there isn't one.

    The old client called shift/start on every mount, so a page refresh left a
    trail of duplicate open shifts. This is idempotent, and the database has a
    partial unique index backing that up.
    """
    shift = await get_active_shift(nurse["id"])
    if shift:
        return {"shift": shift, "created": False}

    shift = await create_shift(nurse["id"])
    return {"shift": shift, "created": True}


@router.post("/end")
async def end_shift(nurse: dict = Depends(get_current_nurse)):
    shift = await get_active_shift(nurse["id"])
    if not shift:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="You have no open shift."
        )

    # you don't get to walk out with patients still on your name and nobody told
    patients = await list_patients_for_nurse(nurse["id"])
    if patients:
        pending = await pending_handoff_patient_ids(nurse["id"])
        unhanded = [p for p in patients if p["id"] not in pending]
        if unhanded:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "Hand off or reassign these patients before ending your shift.",
                    "patients": [
                        {"id": p["id"], "full_name": p["full_name"], "bed": p["bed"]}
                        for p in unhanded
                    ],
                },
            )

    closed = await close_shift(shift["id"])
    return {"shift": closed, "message": "Shift closed."}
