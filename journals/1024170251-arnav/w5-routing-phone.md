# Week 5 : Role Routing and Phone Demo

**Feature:** Sent nurses and doctors to their own screens after login, and made the app open on a phone.

**Problem:** Doctors couldn't use the nurse-only screens, and on a phone `localhost` wouldn't reach the backend or allow the microphone.

**Solution:** Added a `RequireRole` guard, and used an HTTPS tunnel with Vite forwarding `/api` to the backend.
