from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import ALLOWED_ORIGINS
from routes import alerts, doctor, handoff, notes, patients, shifts, staff

app = FastAPI(title="CareBridge API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(staff.router, prefix="/api/staff", tags=["Staff"])
app.include_router(shifts.router, prefix="/api/shifts", tags=["Shifts"])
app.include_router(patients.router, prefix="/api/patients", tags=["Patients"])
app.include_router(notes.router, prefix="/api/notes", tags=["Notes"])
app.include_router(handoff.router, prefix="/api/handoff", tags=["Handoff"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["Alerts"])
app.include_router(doctor.router, prefix="/api/doctor", tags=["Doctor"])


@app.get("/health")
def health():
    return {"status": "CareBridge is live 🚀"}
