"""Voice capture and Fix spelling: the review gate and how failures behave.

Providers are always faked, so these need no keys and no network.
"""

import asyncio
import io
from types import SimpleNamespace

import pytest

from routes import notes as notes_routes
from services import access as access_module
from services import stt as stt_module
from tests.conftest import PATIENT_ID, PRIYA, patient


def _audio(content: bytes = b"RIFFfake"):
    return {"audio": ("recording.wav", io.BytesIO(content), "audio/wav")}


@pytest.fixture
def db(monkeypatch):
    state = {"patient": patient(), "notes": []}

    async def get_patient(patient_id):
        return state["patient"]

    async def insert_note(**kwargs):
        state["notes"].append(kwargs)
        return kwargs

    async def correct_note(text):
        return {"corrected": "Paracetamol 500mg given.", "section": "detail", "ok": True}

    monkeypatch.setattr(access_module, "get_patient", get_patient)
    monkeypatch.setattr(notes_routes, "insert_note", insert_note)
    monkeypatch.setattr(notes_routes, "correct_note", correct_note)
    return state


@pytest.fixture
def heard(monkeypatch):
    """What the speech provider 'hears'."""
    result = {"transcript": "paracetmol 500mg given", "confidence": 0.91, "provider": "groq"}

    async def transcribe_audio(audio_bytes, language):
        return result

    monkeypatch.setattr(notes_routes, "transcribe_audio", transcribe_audio)
    return result


def _post_audio(client, **data):
    return client.post(
        "/api/notes/transcribe",
        files=_audio(),
        data={"patient_id": PATIENT_ID, **data},
    )


# ---------------------------------------------------------------- review gate

def test_transcribing_saves_nothing(as_priya, db, heard):
    response = _post_audio(as_priya)

    assert response.status_code == 200
    body = response.json()
    assert body["saved"] is False
    assert body["raw_transcript"] == "paracetmol 500mg given"
    assert body["corrected"] == "Paracetamol 500mg given."
    # the actual guarantee: no row was written
    assert db["notes"] == []


def test_fix_spelling_saves_nothing(as_priya, db):
    response = as_priya.post(
        "/api/notes/correct",
        json={"patient_id": PATIENT_ID, "text": "paracetmol 500mg given"},
    )

    assert response.status_code == 200
    assert response.json() == {"corrected": "Paracetamol 500mg given.", "changed": True}
    assert db["notes"] == []


# ---------------------------------------------------------------- confidence

def test_low_confidence_is_flagged(as_priya, db, heard):
    heard["confidence"] = 0.4
    assert _post_audio(as_priya).json()["low_confidence"] is True


def test_unknown_confidence_is_not_presented_as_a_score(as_priya, db, heard):
    heard["confidence"] = None
    body = _post_audio(as_priya).json()
    assert body["confidence"] is None
    assert body["low_confidence"] is False


def test_no_segments_means_unknown_rather_than_a_made_up_number():
    assert stt_module._confidence_from_segments([]) is None
    assert stt_module._confidence_from_segments(None) is None
    assert stt_module._confidence_from_segments([{"no_speech_prob": 0.2}]) == 0.8


# ---------------------------------------------------------------- failures

def test_no_speech_detected(as_priya, db, heard):
    heard["transcript"] = ""
    assert _post_audio(as_priya).status_code == 422


def test_empty_upload_is_rejected(as_priya, db, heard):
    response = as_priya.post(
        "/api/notes/transcribe", files=_audio(b""), data={"patient_id": PATIENT_ID}
    )
    assert response.status_code == 400


def test_oversized_upload_is_rejected(as_priya, db, heard, monkeypatch):
    monkeypatch.setattr(notes_routes, "MAX_AUDIO_BYTES", 4)
    assert _post_audio(as_priya).status_code == 413


def test_missing_key_tells_her_to_type(as_priya, db, monkeypatch):
    monkeypatch.setattr(stt_module, "groq_client", None)

    response = _post_audio(as_priya)

    assert response.status_code == 503
    assert "type" in response.json()["detail"]


def test_provider_error_tells_her_to_type(as_priya, db, monkeypatch):
    async def boom(**kwargs):
        raise ConnectionError("provider down")

    fake = SimpleNamespace(
        audio=SimpleNamespace(transcriptions=SimpleNamespace(create=boom))
    )
    monkeypatch.setattr(stt_module, "groq_client", fake)

    assert _post_audio(as_priya).status_code == 503


def test_fix_spelling_unavailable_is_reported(as_priya, db, monkeypatch):
    async def correct_note(text):
        return {"corrected": text, "section": "detail", "ok": False}

    monkeypatch.setattr(notes_routes, "correct_note", correct_note)

    response = as_priya.post(
        "/api/notes/correct", json={"patient_id": PATIENT_ID, "text": "obs stable"}
    )
    assert response.status_code == 503


# ---------------------------------------------------------------- routing and access

@pytest.fixture
def providers(monkeypatch):
    calls = []

    async def groq_create(**kwargs):
        calls.append("groq")
        return SimpleNamespace(text="heard", segments=None)

    async def sarvam_transcribe(**kwargs):
        calls.append("sarvam")
        return SimpleNamespace(transcript="सुना", language_probability=0.99)

    monkeypatch.setattr(
        stt_module,
        "groq_client",
        SimpleNamespace(
            audio=SimpleNamespace(transcriptions=SimpleNamespace(create=groq_create))
        ),
    )
    monkeypatch.setattr(
        stt_module,
        "sarvam_client",
        SimpleNamespace(speech_to_text=SimpleNamespace(transcribe=sarvam_transcribe)),
    )
    return calls


def test_english_goes_to_groq(providers):
    asyncio.run(stt_module.transcribe_audio(b"x", "en"))
    assert providers == ["groq"]


def test_hindi_goes_to_sarvam_without_a_fake_confidence(providers):
    result = asyncio.run(stt_module.transcribe_audio(b"x", "hi"))
    assert providers == ["sarvam"]
    assert result["confidence"] is None


def test_an_unknown_language_is_rejected(as_priya, db, heard):
    assert _post_audio(as_priya, language="fr").status_code == 422


def test_cannot_transcribe_for_someone_elses_patient(as_ananya, db, heard):
    db["patient"] = patient(nurse_id=PRIYA["id"])
    assert _post_audio(as_ananya).status_code == 403


def test_cannot_fix_spelling_for_someone_elses_patient(as_ananya, db):
    db["patient"] = patient(nurse_id=PRIYA["id"])
    response = as_ananya.post(
        "/api/notes/correct", json={"patient_id": PATIENT_ID, "text": "obs stable"}
    )
    assert response.status_code == 403
