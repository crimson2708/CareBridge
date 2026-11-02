"""Request identity.

Every write in this API used to take a client-supplied `nurse_id`, which meant
any caller could log or hand off as anyone. Identity now comes from the
Supabase Auth JWT and nothing else — the client cannot name itself.
"""

import time
from typing import Optional

from fastapi import Depends, Header, HTTPException, status

from services.db import get_staff, supabase

# Verifying a token means a round trip to GoTrue. Nurses hit several endpoints
# per screen, so cache the token -> user id mapping briefly.
_TOKEN_TTL_SECONDS = 60
_token_cache: dict[str, tuple[str, float]] = {}


def _cached_user_id(token: str) -> Optional[str]:
    entry = _token_cache.get(token)
    if not entry:
        return None
    user_id, cached_at = entry
    if time.monotonic() - cached_at > _TOKEN_TTL_SECONDS:
        _token_cache.pop(token, None)
        return None
    return user_id


async def _resolve_user_id(token: str) -> str:
    cached = _cached_user_id(token)
    if cached:
        return cached

    try:
        response = await supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session."
        )

    user = getattr(response, "user", None)
    if not user or not user.id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session."
        )

    # prune opportunistically; this dict only ever holds live sessions
    if len(_token_cache) > 512:
        _token_cache.clear()
    _token_cache[token] = (user.id, time.monotonic())
    return user.id


async def get_current_staff(authorization: str = Header(default="")) -> dict:
    """Resolve the signed-in staff member, or raise 401/403."""
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = await _resolve_user_id(token.strip())
    staff = await get_staff(user_id)

    if not staff:
        # authenticated with Supabase but never onboarded into the ward roster
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No staff profile is linked to this account.",
        )
    if not staff.get("active"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This account is deactivated."
        )

    return staff


async def get_current_nurse(staff: dict = Depends(get_current_staff)) -> dict:
    """Nurse-only routes. The admin surface is a later iteration."""
    if staff["role"] != "nurse":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is for nursing staff.",
        )
    return staff


async def get_current_doctor(staff: dict = Depends(get_current_staff)) -> dict:
    if staff["role"] != "doctor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is for doctors.",
        )
    return staff
