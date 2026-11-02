"""Speech to text: Groq-hosted Whisper for English, Sarvam for Hindi.

The client always uploads 16-bit PCM WAV (see frontend/src/AudioRecorder.tsx).
"""

import logging
from typing import Optional

from config import GROQ_STT_MODEL, SARVAM_STT_MODEL, groq_client, sarvam_client

logger = logging.getLogger(__name__)

_WAV_FILE = "recording.wav"
_WAV_TYPE = "audio/wav"


class TranscriptionUnavailable(Exception):
    """The provider is unconfigured or failed. The nurse can still type."""


def _no_speech_prob(segment) -> float:
    if isinstance(segment, dict):
        return segment.get("no_speech_prob") or 0
    return getattr(segment, "no_speech_prob", 0) or 0


def _confidence_from_segments(segments: Optional[list]) -> Optional[float]:
    """None means unknown. Never invent a number: a made-up 95% would tell the
    nurse a bad transcript was fine."""
    if not segments:
        return None
    average = sum(_no_speech_prob(s) for s in segments) / len(segments)
    return round(max(0.0, 1 - average), 2)


async def _transcribe_with_groq(audio_bytes: bytes) -> dict:
    if groq_client is None:
        raise TranscriptionUnavailable("GROQ_API_KEY is not configured.")

    result = await groq_client.audio.transcriptions.create(
        file=(_WAV_FILE, audio_bytes, _WAV_TYPE),
        model=GROQ_STT_MODEL,
        language="en",
        response_format="verbose_json",
    )
    return {
        "transcript": (result.text or "").strip(),
        "confidence": _confidence_from_segments(getattr(result, "segments", None)),
        "provider": "groq",
    }


async def _transcribe_with_sarvam(audio_bytes: bytes) -> dict:
    if sarvam_client is None:
        raise TranscriptionUnavailable("SARVAM_API_KEY is not configured.")

    result = await sarvam_client.speech_to_text.transcribe(
        file=(_WAV_FILE, audio_bytes, _WAV_TYPE),
        model=SARVAM_STT_MODEL,
        mode="transcribe",
        language_code="hi-IN",
        input_audio_codec="wav",
    )
    # Sarvam's language_probability scores the language detection, not the
    # accuracy of the words, so it is not reported as confidence.
    return {
        "transcript": (result.transcript or "").strip(),
        "confidence": None,
        "provider": "sarvam",
    }


async def transcribe_audio(audio_bytes: bytes, language: str = "en") -> dict:
    try:
        if language == "hi":
            return await _transcribe_with_sarvam(audio_bytes)
        return await _transcribe_with_groq(audio_bytes)
    except TranscriptionUnavailable:
        raise
    except Exception as exc:
        logger.warning("Transcription failed (%s): %s", language, exc)
        raise TranscriptionUnavailable(str(exc)) from exc
