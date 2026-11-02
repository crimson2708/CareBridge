"""The guards around model output. The model itself is always faked."""

import asyncio

import pytest

from services import groq_llm

NOTES = [
    {"section": "detail", "body": "Paracetamol 500mg given at 10:00."},
    {"section": "major_decision", "body": "Antiemetic held pending review."},
]
AS_WRITTEN = {
    "details": "Paracetamol 500mg given at 10:00.",
    "major_decisions": "Antiemetic held pending review.",
    "generated": False,
}


@pytest.fixture
def model(monkeypatch):
    """Set model['reply'] to a dict to return, or an Exception to raise."""
    state = {"reply": {}, "calls": 0}

    async def complete(system_prompt, user_content):
        state["calls"] += 1
        state["sent"] = user_content
        if isinstance(state["reply"], Exception):
            raise state["reply"]
        return state["reply"]

    monkeypatch.setattr(groq_llm, "_complete_json", complete)
    return state


# ---------------------------------------------------------------- correct_note

def test_correction_is_applied(model):
    model["reply"] = {"corrected": "Paracetamol 500mg given.", "section": "major_decision"}

    result = asyncio.run(groq_llm.correct_note("paracetmol 500mg given"))

    assert result == {
        "corrected": "Paracetamol 500mg given.",
        "section": "major_decision",
        "ok": True,
    }


@pytest.mark.parametrize(
    "bad_output",
    [
        "Paracetamol 50mg given at 10:00.",  # changed
        "Paracetamol 500mg given at 10:00 and 22:00.",  # added
        "Paracetamol given at 10:00.",  # removed
    ],
)
def test_a_correction_that_touches_a_number_is_discarded(model, bad_output):
    model["reply"] = {"corrected": bad_output, "section": "detail"}
    original = "paracetmol 500mg given at 10:00"

    result = asyncio.run(groq_llm.correct_note(original))

    assert result["corrected"] == original


def test_provider_failure_keeps_her_text_and_reports_it(model):
    model["reply"] = ConnectionError("down")

    result = asyncio.run(groq_llm.correct_note("obs stable"))

    assert result == {"corrected": "obs stable", "section": "detail", "ok": False}


def test_malformed_correction_keeps_her_text(model):
    model["reply"] = {"section": "nonsense"}

    result = asyncio.run(groq_llm.correct_note("obs stable"))

    assert result["corrected"] == "obs stable"
    assert result["section"] == "detail"


# ---------------------------------------------------------------- parsing

def test_fenced_json_is_parsed():
    assert groq_llm._parse_json('```json\n{"a": 1}\n```') == {"a": 1}


def test_unparseable_output_becomes_empty():
    assert groq_llm._parse_json("sorry, I can't") == {}
    assert groq_llm._parse_json("[1, 2]") == {}


# ---------------------------------------------------------------- summarise_handoff

def test_summary_is_returned(model):
    model["reply"] = {
        "details": "Had paracetamol 500mg at 10:00.",
        "major_decisions": "Antiemetic on hold.",
    }

    result = asyncio.run(groq_llm.summarise_handoff(NOTES))

    assert result["generated"] is True
    assert result["details"] == "Had paracetamol 500mg at 10:00."


def test_no_notes_means_no_model_call(model):
    result = asyncio.run(groq_llm.summarise_handoff([]))

    assert model["calls"] == 0
    assert result == {"details": "", "major_decisions": "", "generated": False}


def test_provider_failure_falls_back_to_her_notes(model):
    model["reply"] = ConnectionError("down")
    assert asyncio.run(groq_llm.summarise_handoff(NOTES)) == AS_WRITTEN


def test_malformed_summary_falls_back_to_her_notes(model):
    model["reply"] = {"summary": "wrong shape"}
    assert asyncio.run(groq_llm.summarise_handoff(NOTES)) == AS_WRITTEN


def test_a_summary_that_invents_a_number_is_discarded(model):
    model["reply"] = {
        "details": "Paracetamol 1000mg given at 10:00.",
        "major_decisions": "Antiemetic held.",
    }
    assert asyncio.run(groq_llm.summarise_handoff(NOTES)) == AS_WRITTEN


def test_the_model_cannot_drop_major_decisions(model):
    model["reply"] = {"details": "Comfortable.", "major_decisions": "  "}

    result = asyncio.run(groq_llm.summarise_handoff(NOTES))

    assert result["major_decisions"] == "Antiemetic held pending review."


def test_the_model_cannot_create_major_decisions(model):
    model["reply"] = {"details": "Comfortable.", "major_decisions": "Stop all fluids."}

    result = asyncio.run(
        groq_llm.summarise_handoff([{"section": "detail", "body": "Comfortable."}])
    )

    assert result["major_decisions"] == ""


def test_the_patient_name_is_not_sent(model):
    """Only the notes go to the provider; the function has no name to send."""
    model["reply"] = {"details": "ok", "major_decisions": "ok"}

    asyncio.run(groq_llm.summarise_handoff(NOTES))

    assert model["sent"].count("\n") == 1  # one line per note, nothing else
