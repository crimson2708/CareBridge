from fastapi import APIRouter, Depends

from services.auth import get_current_nurse, get_current_staff
from services.db import get_active_shift, list_nurses

router = APIRouter()


@router.get("/me")
async def me(staff: dict = Depends(get_current_staff)):
    shift = None
    if staff["role"] == "nurse":
        shift = await get_active_shift(staff["id"])
    return {"staff": staff, "active_shift": shift}


@router.get("/nurses")
async def nurses(nurse: dict = Depends(get_current_nurse)):
    """The handoff recipient picker. Excludes the caller — you can't hand off
    to yourself (the database rejects it too)."""
    return {"nurses": await list_nurses(exclude_id=nurse["id"])}
