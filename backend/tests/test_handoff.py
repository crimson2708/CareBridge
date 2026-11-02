"""The handoff state machine and its access boundaries.

The database enforces its own half of this (see the check constraints and the
partial unique index on handoffs); these cover the route logic on top: who may
answer, what a response requires, and which patient actually moves.
"""

import pytest

from routes import handoff as handoff_routes
from services import access as access_module
from tests.conftest import ANANYA, PATIENT_ID, PRIYA, handoff, patient


@pytest.fixture
def db(monkeypatch):
    """Records the writes the route performs, so we can assert on them."""
    state = {
        "handoff": handoff(),
        "responded": None,
        "reassigned": None,
        "events": [],
        "patient": patient(),
    }

    async def get_handoff(handoff_id):
        return state["handoff"]

    async def respond_to_handoff(handoff_id, status, response_note):
        if state["handoff"]["status"] != "pending":
            return {}  # already answered
        state["responded"] = {"status": status, "note": response_note}
        return {**state["handoff"], "status": status, "response_note": response_note}

    async def reassign_patient(patient_id, nurse_id):
        state["reassigned"] = (patient_id, nurse_id)

    async def insert_handoff_event(handoff_id, actor_id, event, note=None):
        state["events"].append(event)

    async def list_notes(patient_id, section=None):
        return []

    async def list_handoff_events(handoff_id):
        return []

    async def get_patient(patient_id):
        return state["patient"]

    monkeypatch.setattr(handoff_routes, "get_handoff", get_handoff)
    monkeypatch.setattr(handoff_routes, "respond_to_handoff", respond_to_handoff)
    monkeypatch.setattr(handoff_routes, "reassign_patient", reassign_patient)
    monkeypatch.setattr(handoff_routes, "insert_handoff_event", insert_handoff_event)
    monkeypatch.setattr(handoff_routes, "list_notes", list_notes)
    monkeypatch.setattr(handoff_routes, "list_handoff_events", list_handoff_events)
    monkeypatch.setattr(access_module, "get_patient", get_patient)
    return state


HANDOFF_ID = handoff()["id"]


# ---------------------------------------------------------------- drafting

@pytest.fixture
def draft_db(db, monkeypatch):
    async def get_active_shift(nurse_id):
        return {"id": "66666666-6666-6666-6666-666666666666"}

    async def list_notes_for_handoff(patient_id, shift_id):
        return [
            {"section": "detail", "body": "Obs stable."},
            {"section": "major_decision", "body": "Fluids stepped down."},
        ]

    async def insert_handoffs(rows):
        raise AssertionError("drafting must not write a handoff")

    monkeypatch.setattr(handoff_routes, "get_active_shift", get_active_shift)
    monkeypatch.setattr(handoff_routes, "list_notes_for_handoff", list_notes_for_handoff)
    monkeypatch.setattr(handoff_routes, "insert_handoffs", insert_handoffs)
    return db


def test_draft_returns_the_summary_and_her_notes_to_check_it_against(
    as_priya, draft_db, monkeypatch
):
    async def summarise_handoff(notes):
        return {"details": "Stable.", "major_decisions": "Fluids down.", "generated": True}

    monkeypatch.setattr(handoff_routes, "summarise_handoff", summarise_handoff)

    response = as_priya.post("/api/handoff/draft", json={"patient_ids": [PATIENT_ID]})

    assert response.status_code == 200
    draft = response.json()["drafts"][0]
    assert draft["details"] == "Stable."
    assert draft["ai_generated"] is True
    assert draft["source_details"] == "Obs stable."
    assert draft["source_major_decisions"] == "Fluids stepped down."
    assert draft["note_count"] == 2


def test_draft_survives_the_model_being_down(as_priya, draft_db, monkeypatch):
    from services import groq_llm

    async def boom(system_prompt, user_content):
        raise ConnectionError("provider down")

    monkeypatch.setattr(groq_llm, "_complete_json", boom)

    response = as_priya.post("/api/handoff/draft", json={"patient_ids": [PATIENT_ID]})

    assert response.status_code == 200
    draft = response.json()["drafts"][0]
    assert draft["ai_generated"] is False
    assert draft["details"] == "Obs stable."
    assert draft["major_decisions"] == "Fluids stepped down."


def test_draft_without_an_open_shift_does_not_read_the_patients_history(
    as_priya, draft_db, monkeypatch
):
    async def get_active_shift(nurse_id):
        return None

    async def list_notes_for_handoff(patient_id, shift_id):
        raise AssertionError("no shift means no notes to read")

    monkeypatch.setattr(handoff_routes, "get_active_shift", get_active_shift)
    monkeypatch.setattr(handoff_routes, "list_notes_for_handoff", list_notes_for_handoff)

    response = as_priya.post("/api/handoff/draft", json={"patient_ids": [PATIENT_ID]})

    assert response.status_code == 200
    draft = response.json()["drafts"][0]
    assert draft["note_count"] == 0
    assert draft["ai_generated"] is False


def test_cannot_draft_for_someone_elses_patient(as_ananya, draft_db):
    response = as_ananya.post("/api/handoff/draft", json={"patient_ids": [PATIENT_ID]})
    assert response.status_code == 403


# ---------------------------------------------------------------- accepting

def test_accept_transfers_the_patient(as_ananya, db):
    response = as_ananya.post(f"/api/handoff/{HANDOFF_ID}/accept")

    assert response.status_code == 200
    assert db["responded"]["status"] == "accepted"
    assert db["reassigned"] == (PATIENT_ID, ANANYA["id"])
    assert "accepted" in db["events"]


# ---------------------------------------------------------------- declining

def test_decline_leaves_the_patient_with_the_sender(as_ananya, db):
    response = as_ananya.post(
        f"/api/handoff/{HANDOFF_ID}/decline",
        json={"note": "Not in my bay — this should go to Ward 4."},
    )

    assert response.status_code == 200
    assert db["responded"]["status"] == "declined"
    # the whole point of Decline: care does NOT move
    assert db["reassigned"] is None


def test_decline_requires_a_reason(as_ananya, db):
    response = as_ananya.post(f"/api/handoff/{HANDOFF_ID}/decline", json={"note": ""})

    assert response.status_code == 422
    assert db["responded"] is None


# ---------------------------------------------------------------- reporting an issue

def test_report_issue_transfers_but_records_the_problem(as_ananya, db):
    response = as_ananya.post(
        f"/api/handoff/{HANDOFF_ID}/report-issue",
        json={"note": "No mention of whether the 18:00 antibiotic was given."},
    )

    assert response.status_code == 200
    assert db["responded"]["status"] == "issue_reported"
    assert "antibiotic" in db["responded"]["note"]
    # unlike Decline, the patient is never left unattended
    assert db["reassigned"] == (PATIENT_ID, ANANYA["id"])


def test_report_issue_requires_a_note(as_ananya, db):
    response = as_ananya.post(f"/api/handoff/{HANDOFF_ID}/report-issue", json={})

    assert response.status_code == 422
    assert db["responded"] is None


# ---------------------------------------------------------------- boundaries

def test_only_the_recipient_may_respond(as_priya, db):
    """The sender cannot accept her own handoff on the recipient's behalf."""
    response = as_priya.post(f"/api/handoff/{HANDOFF_ID}/accept")

    assert response.status_code == 403
    assert db["responded"] is None
    assert db["reassigned"] is None


def test_an_answered_handoff_cannot_be_answered_again(as_ananya, db):
    db["handoff"] = handoff(status="accepted")

    response = as_ananya.post(
        f"/api/handoff/{HANDOFF_ID}/decline", json={"note": "changed my mind"}
    )

    assert response.status_code == 409
    assert db["reassigned"] is None


def test_a_stranger_cannot_read_the_handoff(as_priya, db):
    db["handoff"] = handoff(to_nurse="99999999-9999-9999-9999-999999999999")
    db["handoff"]["from_nurse_id"] = "88888888-8888-8888-8888-888888888888"

    response = as_priya.get(f"/api/handoff/{HANDOFF_ID}")

    assert response.status_code == 403


def test_opening_a_handoff_records_that_it_was_viewed(as_ananya, db):
    """'She read it before acting' has to be checkable, not assumed."""
    response = as_ananya.get(f"/api/handoff/{HANDOFF_ID}")

    assert response.status_code == 200
    assert "viewed" in db["events"]


def test_the_sender_reading_it_back_is_not_a_view(as_priya, db):
    response = as_priya.get(f"/api/handoff/{HANDOFF_ID}")

    assert response.status_code == 200
    assert db["events"] == []
