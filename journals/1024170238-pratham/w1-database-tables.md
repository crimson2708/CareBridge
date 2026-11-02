# Week 1 : Database Tables

**Feature:** Created the seven Supabase tables: staff, patients, shifts, patient notes, handoffs, handoff events and alerts.

**Problem:** Details and major decisions could end up in separate tables, and the patient log could then drift out of step with them.

**Solution:** Keep all notes in one table with a `section` column, so every view reads the same rows.
