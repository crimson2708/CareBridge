"""Note recording and its access boundaries."""

import pytest

from routes import notes as notes_routes
from services import access as access_module
from tests.conftest import PATIENT_ID, PRIYA, patient


@pytest.fixture
def db(monkeypatch):
    state = {"patient": patient(), "notes": []}

    async def get_patient(patient_id):
        return state["patient"]

    async def get_active_shift(nurse_id):
        return {"id": "66666666-6666-6666-6666-666666666666"}

    async def insert_note(**kwargs):
        state["notes"].append(kwargs)
        return {"id": "77777777-7777-7777-7777-777777777777", **kwargs}

    monkeypatch.setattr(access_module, "get_patient", get_patient)
    monkeypatch.setattr(notes_routes, "get_active_shift", get_active_shift)
    monkeypatch.setattr(notes_routes, "insert_note", insert_note)
    return state


def test_saving_a_note_records_the_author_and_section(as_priya, db):
    response = as_priya.post(
        "/api/notes",
        json={
            "patient_id": PATIENT_ID,
            "section": "major_decision",
            "body": "IV fluids stepped down to maintenance. Reassess at 20:00.",
        },
    )

    assert response.status_code == 200
    saved = db["notes"][0]
    assert saved["section"] == "major_decision"
    assert saved["body"].startswith("IV fluids")
    # identity comes from the token, never from the request body
    assert saved["author_id"] == PRIYA["id"]
    assert saved["shift_id"] == "66666666-6666-6666-6666-666666666666"


def test_a_voice_note_keeps_what_was_heard_next_to_what_she_approved(as_priya, db):
    response = as_priya.post(
        "/api/notes",
        json={
            "patient_id": PATIENT_ID,
            "section": "detail",
            "body": "Paracetamol 500mg given. Corrected by nurse.",
            "source": "voice",
            "raw_transcript": "paracetmol 500mg given",
            "stt_confidence": 0.91,
        },
    )

    assert response.status_code == 200
    saved = db["notes"][0]
    assert saved["source"] == "voice"
    assert saved["body"].endswith("Corrected by nurse.")
    assert saved["raw_transcript"] == "paracetmol 500mg given"
    assert saved["stt_confidence"] == 0.91


def test_a_typed_note_ignores_voice_fields(as_priya, db):
    response = as_priya.post(
        "/api/notes",
        json={
            "patient_id": PATIENT_ID,
            "section": "detail",
            "body": "Obs stable.",
            "raw_transcript": "should not be stored",
            "stt_confidence": 0.5,
        },
    )

    assert response.status_code == 200
    saved = db["notes"][0]
    assert saved["source"] == "typed"
    assert saved["raw_transcript"] is None
    assert saved["stt_confidence"] is None


def test_note_body_is_trimmed(as_priya, db):
    response = as_priya.post(
        "/api/notes",
        json={
            "patient_id": PATIENT_ID,
            "section": "detail",
            "body": "  Obs stable through the morning.  ",
        },
    )

    assert response.status_code == 200
    assert db["notes"][0]["body"] == "Obs stable through the morning."


def test_an_empty_note_is_rejected(as_priya, db):
    response = as_priya.post(
        "/api/notes",
        json={"patient_id": PATIENT_ID, "section": "detail", "body": "   "},
    )

    assert response.status_code in (400, 422)
    assert db["notes"] == []


def test_an_unknown_section_is_rejected(as_priya, db):
    response = as_priya.post(
        "/api/notes",
        json={"patient_id": PATIENT_ID, "section": "gossip", "body": "..."},
    )

    assert response.status_code == 422
    assert db["notes"] == []


def test_cannot_write_notes_for_someone_elses_patient(as_ananya, db):
    db["patient"] = patient(nurse_id=PRIYA["id"])

    response = as_ananya.post(
        "/api/notes",
        json={"patient_id": PATIENT_ID, "section": "detail", "body": "Obs stable."},
    )

    assert response.status_code == 403
    assert db["notes"] == []
