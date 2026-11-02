# Week 2 : Frontend Integration

**Feature:** Connected the React screens to the backend for patients, notes, shifts and handoffs.

**Problem:** Every request had to carry the login token, and an expired session shouldn't leave the user stuck on a broken screen.

**Solution:** An Axios interceptor adds the token to each request, and a 401 response signs the user out and returns them to login.
