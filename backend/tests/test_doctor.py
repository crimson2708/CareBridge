"""Alerts, the doctor's screen, and the role boundaries between them."""

import pytest
from fastapi.testclient import TestClient

import main
from routes import alerts as alerts_routes
from routes import doctor as doctor_routes
from services import access as access_module
from services.auth import get_current_staff
from tests.conftest import DOCTOR_ID, MEHTA, PATIENT_ID, PRIYA, patient

ALERT_ID = "99999999-9999-9999-9999-999999999999"


def alert(status: str = "open", doctor_id: str = DOCTOR_ID) -> dict:
    return {
        "id": ALERT_ID,
        "patient_id": PATIENT_ID,
        "raised_by": PRIYA["id"],
        "doctor_id": doctor_id,
        "message": "BP dropping.",
        "status": status,
        "created_at": "2026-09-08T14:00:00+00:00",
        "acknowledged_at": None if status == "open" else "2026-09-08T14:05:00+00:00",
    }


@pytest.fixture
def db(monkeypatch):
    state = {
        "patient": patient(),
        "doctor": MEHTA,
        "alert": alert(),
        "inserted": [],
        "acknowledged": [],
    }

    async def get_patient(patient_id):
        return state["patient"]

    async def has_pending_handoff_to(patient_id, nurse_id):
        return False

    async def get_staff(staff_id):
        return state["doctor"] if staff_id == DOCTOR_ID else PRIYA

    async def insert_alert(patient_id, raised_by, doctor_id, message):
        row = {
            "patient_id": patient_id,
            "raised_by": raised_by,
            "doctor_id": doctor_id,
            "message": message,
        }
        state["inserted"].append(row)
        return row

    async def get_alert(alert_id):
        return state["alert"]

    async def acknowledge_alert(alert_id):
        if state["alert"]["status"] != "open":
            return {}
        state["acknowledged"].append(alert_id)
        return alert("acknowledged")

    async def list_alerts_for_patient(patient_id):
        return [state["alert"]]

    async def list_open_alerts(doctor_id):
        return [state["alert"]] if state["alert"]["status"] == "open" else []

    async def list_acknowledged_alerts(doctor_id):
        return [state["alert"]] if state["alert"]["status"] == "acknowledged" else []

    async def list_notes(patient_id):
        return [{"id": "n1", "section": "detail", "body": "Obs stable."}]

    async def list_patients_for_doctor(doctor_id):
        quiet = {**patient(), "id": "quiet-patient", "bed": "1A"}
        alerted = {**patient(), "bed": "12A"}
        return [quiet, alerted]

    async def count_notes_by_patient(patient_ids):
        return {PATIENT_ID: {"note_count": 2, "last_note_at": "2026-09-08T13:00:00+00:00"}}

    monkeypatch.setattr(access_module, "get_patient", get_patient)
    monkeypatch.setattr(access_module, "has_pending_handoff_to", has_pending_handoff_to)
    monkeypatch.setattr(alerts_routes, "get_staff", get_staff)
    monkeypatch.setattr(alerts_routes, "insert_alert", insert_alert)
    monkeypatch.setattr(alerts_routes, "list_alerts_for_patient", list_alerts_for_patient)
    monkeypatch.setattr(doctor_routes, "get_staff", get_staff)
    monkeypatch.setattr(doctor_routes, "get_alert", get_alert)
    monkeypatch.setattr(doctor_routes, "acknowledge_alert", acknowledge_alert)
    monkeypatch.setattr(doctor_routes, "list_alerts_for_patient", list_alerts_for_patient)
    monkeypatch.setattr(doctor_routes, "list_open_alerts", list_open_alerts)
    monkeypatch.setattr(doctor_routes, "list_acknowledged_alerts", list_acknowledged_alerts)
    monkeypatch.setattr(doctor_routes, "list_notes", list_notes)
    monkeypatch.setattr(doctor_routes, "list_patients_for_doctor", list_patients_for_doctor)
    monkeypatch.setattr(doctor_routes, "count_notes_by_patient", count_notes_by_patient)
    return state


# ---------------------------------------------------------------- raising

def test_an_alert_goes_to_the_patients_doctor_from_the_signed_in_nurse(as_priya, db):
    response = as_priya.post(
        "/api/alerts", json={"patient_id": PATIENT_ID, "message": "  BP dropping.  "}
    )

    assert response.status_code == 200
    saved = db["inserted"][0]
    assert saved["doctor_id"] == DOCTOR_ID
    assert saved["raised_by"] == PRIYA["id"]
    assert saved["message"] == "BP dropping."
    assert response.json()["sent_to"] == MEHTA["full_name"]


def test_the_message_is_optional(as_priya, db):
    response = as_priya.post("/api/alerts", json={"patient_id": PATIENT_ID, "message": "   "})

    assert response.status_code == 200
    assert db["inserted"][0]["message"] is None


def test_a_nurse_cannot_alert_about_someone_elses_patient(as_ananya, db):
    response = as_ananya.post("/api/alerts", json={"patient_id": PATIENT_ID})

    assert response.status_code == 403
    assert db["inserted"] == []


def test_no_assigned_doctor_is_refused_rather_than_lost(as_priya, db):
    db["patient"] = patient(doctor_id=None)

    response = as_priya.post("/api/alerts", json={"patient_id": PATIENT_ID})

    assert response.status_code == 409
    assert db["inserted"] == []


def test_a_deactivated_doctor_is_refused_rather_than_lost(as_priya, db):
    db["doctor"] = {**MEHTA, "active": False}

    response = as_priya.post("/api/alerts", json={"patient_id": PATIENT_ID})

    assert response.status_code == 409
    assert db["inserted"] == []


def test_the_nurse_can_see_whether_her_alert_was_acknowledged(as_priya, db):
    db["alert"] = alert("acknowledged")

    response = as_priya.get(f"/api/alerts/patient/{PATIENT_ID}")

    assert response.status_code == 200
    assert response.json()["alerts"][0]["acknowledged_at"] is not None


# ---------------------------------------------------------------- doctor's screen

def test_patients_with_open_alerts_come_first_then_bed_order(as_mehta, db):
    response = as_mehta.get("/api/doctor/patients")

    assert response.status_code == 200
    rows = response.json()["patients"]
    assert [row["id"] for row in rows] == [PATIENT_ID, "quiet-patient"]
    assert rows[0]["open_alert_count"] == 1
    assert rows[0]["note_count"] == 2
    assert rows[1]["open_alert_count"] == 0
    assert rows[1]["note_count"] == 0


def test_a_doctor_reads_the_log_of_their_own_patient(as_mehta, db):
    response = as_mehta.get(f"/api/doctor/patients/{PATIENT_ID}")

    assert response.status_code == 200
    body = response.json()
    assert body["notes"][0]["body"] == "Obs stable."
    assert body["alerts"][0]["id"] == ALERT_ID
    assert body["nurse"]["id"] == PRIYA["id"]


def test_a_doctor_cannot_read_another_doctors_patient(as_other_doctor, db):
    response = as_other_doctor.get(f"/api/doctor/patients/{PATIENT_ID}")

    assert response.status_code == 403


# ---------------------------------------------------------------- acknowledging

def test_acknowledging_records_it_and_clears_it_from_open(as_mehta, db):
    assert as_mehta.get("/api/doctor/alerts").json()["open_count"] == 1

    response = as_mehta.post(f"/api/doctor/alerts/{ALERT_ID}/acknowledge")

    assert response.status_code == 200
    assert db["acknowledged"] == [ALERT_ID]
    assert response.json()["alert"]["status"] == "acknowledged"


def test_only_the_alerted_doctor_can_acknowledge(as_other_doctor, db):
    response = as_other_doctor.post(f"/api/doctor/alerts/{ALERT_ID}/acknowledge")

    assert response.status_code == 403
    assert db["acknowledged"] == []


def test_acknowledging_twice_keeps_the_first_time(as_mehta, db):
    db["alert"] = alert("acknowledged")

    response = as_mehta.post(f"/api/doctor/alerts/{ALERT_ID}/acknowledge")

    assert response.status_code == 409
    assert db["acknowledged"] == []


def test_missing_alert_is_404(as_mehta, db, monkeypatch):
    async def get_alert(alert_id):
        return None

    monkeypatch.setattr(doctor_routes, "get_alert", get_alert)

    response = as_mehta.post(f"/api/doctor/alerts/{ALERT_ID}/acknowledge")

    assert response.status_code == 404


# ---------------------------------------------------------------- role boundaries

@pytest.fixture
def real_role_checks():
    """Only identity is faked here, so the actual nurse and doctor checks run."""

    def signed_in_as(staff):
        main.app.dependency_overrides[get_current_staff] = lambda: staff
        return TestClient(main.app)

    yield signed_in_as
    main.app.dependency_overrides.clear()


@pytest.mark.parametrize(
    "path", ["/api/doctor/patients", f"/api/doctor/patients/{PATIENT_ID}", "/api/doctor/alerts"]
)
def test_a_nurse_cannot_use_the_doctor_routes(real_role_checks, db, path):
    assert real_role_checks(PRIYA).get(path).status_code == 403


def test_a_nurse_cannot_acknowledge_an_alert(real_role_checks, db):
    client = real_role_checks(PRIYA)

    response = client.post(f"/api/doctor/alerts/{ALERT_ID}/acknowledge")

    assert response.status_code == 403
    assert db["acknowledged"] == []


def test_a_doctor_cannot_raise_an_alert(real_role_checks, db):
    response = real_role_checks(MEHTA).post("/api/alerts", json={"patient_id": PATIENT_ID})

    assert response.status_code == 403
    assert db["inserted"] == []


@pytest.mark.parametrize("path", ["/api/patients/mine", f"/api/notes/patient/{PATIENT_ID}"])
def test_a_doctor_cannot_use_the_nurse_routes(real_role_checks, db, path):
    assert real_role_checks(MEHTA).get(path).status_code == 403
