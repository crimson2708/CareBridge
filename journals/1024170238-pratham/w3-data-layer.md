# Week 3 : Data Layer

**Feature:** Wrote `db.py`, which holds every database query the backend runs.

**Problem:** Requests failed intermittently on Windows with `WinError 10035`, because the synchronous client shared one connection pool across threads.

**Solution:** Switch to the async Supabase client. In a 175-request load test, failures went from 19 to 0.
