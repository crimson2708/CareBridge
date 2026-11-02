# Week 4 : Voice and AI Routes

**Feature:** Built `POST /api/notes/transcribe` for voice notes and `POST /api/notes/correct` for the Fix spelling button.

**Problem:** A wrong transcription must never reach the patient record without a nurse checking it.

**Solution:** Both routes only return a draft and save nothing. Only `POST /api/notes` saves, after she has reviewed the text.
