# Week 3 : Handoff Routes

**Feature:** Built the endpoints to draft, send and read handoffs, and to accept, decline or report an issue.

**Problem:** It wasn't clear who holds the patient after Report Issue, and two responses could arrive at once.

**Solution:** Report Issue transfers the patient and keeps the issue on record. A second response gets HTTP 409, so the first one stands.
