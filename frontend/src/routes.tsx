import type { StaffRole } from "./api/types";

export type AppRoute = "/dashboard" | "/patients" | "/handoff";

export interface RouteItem {
  path: AppRoute;
  label: string;
  description: string;
}

export const DEFAULT_ROUTE: AppRoute = "/dashboard";

/** The bottom tab bar. The nurse workflow is these three surfaces. */
export const PRIMARY_ROUTES: RouteItem[] = [
  {
    path: "/dashboard",
    label: "Shift",
    description: "Shift overview and incoming handoffs",
  },
  {
    path: "/patients",
    label: "My Patients",
    description: "Patients under your care",
  },
  {
    path: "/handoff",
    label: "Handoff",
    description: "Receive and send patient handoffs",
  },
];

export const DOCTOR_PATIENTS_ROUTE = "/doctor/patients";
export const DOCTOR_ALERTS_ROUTE = "/doctor/alerts";

/** Where a role lands after signing in. Admin has no screen yet. */
export const homeRouteFor = (role: StaffRole): string | null =>
  role === "nurse" ? DEFAULT_ROUTE : role === "doctor" ? DOCTOR_PATIENTS_ROUTE : null;

export const doctorPatientPath = (patientId: string) =>
  `${DOCTOR_PATIENTS_ROUTE}/${patientId}`;
export const patientDetailPath = (patientId: string) => `/patients/${patientId}`;
export const patientNotePath = (patientId: string) => `/patients/${patientId}/note`;
export const handoffReviewPath = (handoffId: string) => `/handoff/${handoffId}`;
