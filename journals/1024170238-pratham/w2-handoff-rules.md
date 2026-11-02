# Week 2 : Handoff Rules in the Database

**Feature:** Added database rules for handoffs: no handing off to yourself, a reason required to decline, and only one pending handoff per patient.

**Problem:** A normal unique constraint on the patient would also block their old, answered handoffs.

**Solution:** Use a partial unique index that only applies to pending handoffs.
