import axios, { AxiosError } from "axios";

import { supabase } from "../lib/supabase";
import type {
  Alert,
  CorrectNoteResponse,
  CreateNoteRequest,
  DoctorAlertsResponse,
  DoctorPatient,
  DoctorPatientDetailResponse,
  Handoff,
  HandoffDetailResponse,
  HandoffDraft,
  HandoffListResponse,
  MeResponse,
  MyPatientsResponse,
  NoteSection,
  NotesResponse,
  PatientDetailResponse,
  PatientNote,
  SendHandoffRequest,
  Shift,
  StaffRef,
  TranscribeResponse,
  VoiceLanguage,
} from "./types";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

const api = axios.create({ baseURL: API_BASE_URL });

// Identity travels in the token, never in a request body: the server decides
// who you are, and the client cannot claim to be another nurse.
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      // the session is gone or expired; RequireAuth will bounce to /login
      await supabase.auth.signOut();
    }
    return Promise.reject(error);
  },
);

/** Pulls the human-readable message out of a FastAPI error response. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object" && "message" in detail) {
      return String((detail as { message: unknown }).message);
    }
  }
  return fallback;
}

// ---------------------------------------------------------------- staff

export async function getMe(): Promise<MeResponse> {
  const { data } = await api.get<MeResponse>("/api/staff/me");
  return data;
}

export async function listNurses(): Promise<{ nurses: StaffRef[] }> {
  const { data } = await api.get<{ nurses: StaffRef[] }>("/api/staff/nurses");
  return data;
}

// ---------------------------------------------------------------- shifts

export async function getCurrentShift(): Promise<{ shift: Shift; created: boolean }> {
  const { data } = await api.get<{ shift: Shift; created: boolean }>(
    "/api/shifts/current",
  );
  return data;
}

export async function endShift(): Promise<{ shift: Shift; message: string }> {
  const { data } = await api.post<{ shift: Shift; message: string }>(
    "/api/shifts/end",
  );
  return data;
}

// ---------------------------------------------------------------- patients

export async function listMyPatients(): Promise<MyPatientsResponse> {
  const { data } = await api.get<MyPatientsResponse>("/api/patients/mine");
  return data;
}

export async function getPatient(patientId: string): Promise<PatientDetailResponse> {
  const { data } = await api.get<PatientDetailResponse>(`/api/patients/${patientId}`);
  return data;
}

// ---------------------------------------------------------------- notes

export async function listNotes(
  patientId: string,
  section?: NoteSection,
): Promise<NotesResponse> {
  const { data } = await api.get<NotesResponse>(`/api/notes/patient/${patientId}`, {
    params: section ? { section } : undefined,
  });
  return data;
}

/** Voice -> draft. Deliberately does not persist; the nurse reviews first. */
export async function transcribeNote(params: {
  audio: Blob;
  patientId: string;
  language: VoiceLanguage;
}): Promise<TranscribeResponse> {
  const formData = new FormData();
  formData.append("audio", params.audio, "recording.wav");
  formData.append("patient_id", params.patientId);
  formData.append("language", params.language);

  const { data } = await api.post<TranscribeResponse>(
    "/api/notes/transcribe",
    formData,
  );
  return data;
}

/** The Fix spelling button: a suggestion, not a save. */
export async function correctNote(
  patientId: string,
  text: string,
): Promise<CorrectNoteResponse> {
  const { data } = await api.post<CorrectNoteResponse>("/api/notes/correct", {
    patient_id: patientId,
    text,
  });
  return data;
}

export async function createNote(
  payload: CreateNoteRequest,
): Promise<{ note: PatientNote }> {
  const { data } = await api.post<{ note: PatientNote }>("/api/notes", payload);
  return data;
}

// ---------------------------------------------------------------- handoff

export async function draftHandoff(
  patientIds: string[],
): Promise<{ drafts: HandoffDraft[] }> {
  const { data } = await api.post<{ drafts: HandoffDraft[] }>("/api/handoff/draft", {
    patient_ids: patientIds,
  });
  return data;
}

export async function sendHandoff(
  payload: SendHandoffRequest,
): Promise<{ handoffs: Handoff[]; count: number; sent_to: string }> {
  const { data } = await api.post("/api/handoff/send", payload);
  return data;
}

export async function getInbox(): Promise<HandoffListResponse> {
  const { data } = await api.get<HandoffListResponse>("/api/handoff/inbox");
  return data;
}

export async function getSentHandoffs(): Promise<HandoffListResponse> {
  const { data } = await api.get<HandoffListResponse>("/api/handoff/sent");
  return data;
}

export async function getHandoff(handoffId: string): Promise<HandoffDetailResponse> {
  const { data } = await api.get<HandoffDetailResponse>(`/api/handoff/${handoffId}`);
  return data;
}

export async function acceptHandoff(handoffId: string) {
  const { data } = await api.post(`/api/handoff/${handoffId}/accept`);
  return data;
}

export async function declineHandoff(handoffId: string, note: string) {
  const { data } = await api.post(`/api/handoff/${handoffId}/decline`, { note });
  return data;
}

export async function reportHandoffIssue(handoffId: string, note: string) {
  const { data } = await api.post(`/api/handoff/${handoffId}/report-issue`, { note });
  return data;
}

// ---------------------------------------------------------------- alerts

export async function raiseAlert(
  patientId: string,
  message: string,
): Promise<{ alert: Alert; sent_to: string }> {
  const { data } = await api.post<{ alert: Alert; sent_to: string }>("/api/alerts", {
    patient_id: patientId,
    message,
  });
  return data;
}

export async function listPatientAlerts(patientId: string): Promise<{ alerts: Alert[] }> {
  const { data } = await api.get<{ alerts: Alert[] }>(`/api/alerts/patient/${patientId}`);
  return data;
}

// ---------------------------------------------------------------- doctor

export async function listDoctorPatients(): Promise<{ patients: DoctorPatient[] }> {
  const { data } = await api.get<{ patients: DoctorPatient[] }>("/api/doctor/patients");
  return data;
}

export async function getDoctorPatient(
  patientId: string,
): Promise<DoctorPatientDetailResponse> {
  const { data } = await api.get<DoctorPatientDetailResponse>(
    `/api/doctor/patients/${patientId}`,
  );
  return data;
}

export async function getDoctorAlerts(): Promise<DoctorAlertsResponse> {
  const { data } = await api.get<DoctorAlertsResponse>("/api/doctor/alerts");
  return data;
}

export async function acknowledgeAlert(alertId: string): Promise<{ alert: Alert }> {
  const { data } = await api.post<{ alert: Alert }>(
    `/api/doctor/alerts/${alertId}/acknowledge`,
  );
  return data;
}
