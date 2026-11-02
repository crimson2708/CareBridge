# Week 4 : Voice Notes in the App

**Feature:** Added recording to the note screen, with a timer, an English/Hindi switch, and the transcript placed in the text box for review.

**Problem:** Sarvam's endpoint is for audio under 30 seconds, so a long Hindi note could fail after the nurse had finished speaking.

**Solution:** Stop Hindi recordings automatically at 28 seconds and show that limit on screen.
