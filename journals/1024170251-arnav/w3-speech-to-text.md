# Week 3 : Speech-to-Text

**Feature:** Added transcription in `stt.py`, using Groq Whisper for English and Sarvam for Hindi.

**Problem:** The old code reported a made-up 95% confidence when it had no score, so a bad transcript could look reliable.

**Solution:** Report the confidence as unknown when there's no real score.
