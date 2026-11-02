# Week 1 : Patient and Shift Routes

**Feature:** Built the endpoints for a nurse's patient list, patient details, and opening and ending a shift.

**Problem:** Refreshing the page could create duplicate shifts, and a nurse could end a shift with patients still on her name.

**Solution:** `GET /api/shifts/current` only opens a shift if none exists, and ending a shift returns HTTP 409 until her patients are handed off.
