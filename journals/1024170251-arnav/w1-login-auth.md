# Week 1 : Login and Authentication

**Feature:** Added login with Supabase Auth. The backend verifies each token and matches it to a staff member.

**Problem:** A nurse appeared to have no patients, because the backend was using the publishable key instead of the secret key.

**Solution:** Use the secret key, and make the backend refuse to start if it finds a publishable key.
