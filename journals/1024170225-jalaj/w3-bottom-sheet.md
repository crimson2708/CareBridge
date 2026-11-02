# Week 3 : Bottom Sheet

**Feature:** Built `BottomSheet`, used for declining a handoff, reporting an issue and alerting a doctor.

**Problem:** Keyboard users could tab out of the sheet into buttons hidden behind it.

**Solution:** Keep focus inside while it's open, close it with Escape, and return focus to the previous element on close.
