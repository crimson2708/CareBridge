# Week 4 : AI Autocorrect

**Feature:** Added AI correction of spelling and medical terms in `groq_llm.py`, plus a suggested section for each note.

**Problem:** The AI could change a dose, and the sentence would still read as correct.

**Solution:** Compare the digits before and after, and keep the original text if they differ.
