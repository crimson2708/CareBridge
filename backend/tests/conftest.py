import os
import sys

# the app is imported as a top-level package (routes.*, services.*), so the
# backend directory has to be on the path when pytest runs from the repo root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

import main
from services.auth import get_current_doctor, get_current_nurse, get_current_staff

PRIYA = {
    "id": "11111111-1111-1111-1111-111111111111",
    "full_name": "Priya Sharma",
    "email": "priya@example.test",
    "role": "nurse",
    "ward": "Ward 3B",
    "active": True,
}

ANANYA = {
    "id": "22222222-2222-2222-2222-222222222222",
    "full_name": "Ananya Rao",
    "email": "ananya@example.test",
    "role": "nurse",
    "ward": "Ward 3B",
    "active": True,
}

PATIENT_ID = "33333333-3333-3333-3333-333333333333"
DOCTOR_ID = "44444444-4444-4444-4444-444444444444"

MEHTA = {
    "id": DOCTOR_ID,
    "full_name": "Dr. Rohan Mehta",
    "email": "mehta@example.test",
    "role": "doctor",
    "ward": "Ward 3B",
    "active": True,
}

OTHER_DOCTOR = {
    **MEHTA,
    "id": "88888888-8888-8888-8888-888888888888",
    "full_name": "Dr. Kavya Iyer",
}


@pytest.fixture
def as_priya():
    """Bypass Supabase Auth; identity is what the dependency returns."""
    main.app.dependency_overrides[get_current_nurse] = lambda: PRIYA
    main.app.dependency_overrides[get_current_staff] = lambda: PRIYA
    with TestClient(main.app) as client:
        yield client
    main.app.dependency_overrides.clear()


@pytest.fixture
def as_ananya():
    main.app.dependency_overrides[get_current_nurse] = lambda: ANANYA
    main.app.dependency_overrides[get_current_staff] = lambda: ANANYA
    with TestClient(main.app) as client:
        yield client
    main.app.dependency_overrides.clear()


@pytest.fixture
def as_mehta():
    main.app.dependency_overrides[get_current_doctor] = lambda: MEHTA
    main.app.dependency_overrides[get_current_staff] = lambda: MEHTA
    with TestClient(main.app) as client:
        yield client
    main.app.dependency_overrides.clear()


@pytest.fixture
def as_other_doctor():
    main.app.dependency_overrides[get_current_doctor] = lambda: OTHER_DOCTOR
    main.app.dependency_overrides[get_current_staff] = lambda: OTHER_DOCTOR
    with TestClient(main.app) as client:
        yield client
    main.app.dependency_overrides.clear()


def patient(nurse_id: str = PRIYA["id"], doctor_id: str | None = DOCTOR_ID) -> dict:
    return {
        "id": PATIENT_ID,
        "mrn": "MRN-0001",
        "full_name": "Ishan Verma",
        "ward": "Ward 3B",
        "bed": "12A",
        "status": "admitted",
        "admitted_at": "2026-09-08T06:00:00+00:00",
        "assigned_nurse_id": nurse_id,
        "assigned_doctor_id": doctor_id,
    }


def handoff(status: str = "pending", to_nurse: str = ANANYA["id"]) -> dict:
    return {
        "id": "55555555-5555-5555-5555-555555555555",
        "patient_id": PATIENT_ID,
        "from_nurse_id": PRIYA["id"],
        "to_nurse_id": to_nurse,
        "from_shift_id": None,
        "details": "Vitals stable.",
        "major_decisions": "IV fluids stepped down.",
        "status": status,
        "response_note": None,
        "sent_at": "2026-09-08T14:00:00+00:00",
        "responded_at": None if status == "pending" else "2026-09-08T14:10:00+00:00",
    }
