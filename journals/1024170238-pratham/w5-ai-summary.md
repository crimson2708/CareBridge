# Week 5 : AI Handoff Summary

**Feature:** Added an AI summary of a nurse's notes from the current shift, which pre-fills the handoff draft.

**Problem:** The AI could invent a number, and a nurse with no open shift would have got the patient's whole history.

**Solution:** Discard any summary containing a number not in the notes and use the notes as written. With no open shift, the draft stays empty.
