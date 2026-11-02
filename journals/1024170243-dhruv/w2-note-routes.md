# Week 2 : Note Routes

**Feature:** Built the endpoints for saving a note and reading a patient's notes by section or as a full log.

**Problem:** If the client sent the author's ID, anyone could write a note as another nurse.

**Solution:** Take the author from the verified login token, and only allow writes to the nurse's own patients.
