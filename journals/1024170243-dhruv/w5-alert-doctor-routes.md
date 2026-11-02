# Week 5 : Alert and Doctor Routes

**Feature:** Built the endpoints for raising an alert, and for a doctor's patients, patient logs, alerts and acknowledgements.

**Problem:** An alert for a patient with no active doctor would never be read, but the nurse would think she had escalated.

**Solution:** Refuse the alert with HTTP 409 and tell her to escalate in person.
