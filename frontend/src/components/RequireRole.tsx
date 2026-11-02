import { Navigate } from "react-router-dom";

import type { StaffRole } from "../api/types";
import { homeRouteFor } from "../routes";
import { useAuth } from "../state/AuthContext";

/** Holds a shell back until the profile has loaded, because the shell's first
 * requests only work for its own role, and sends anyone else to their own home. */
export default function RequireRole({
  role,
  children,
}: {
  role: StaffRole;
  children: React.ReactNode;
}) {
  const { staff, profileError, signOut } = useAuth();

  const notice = profileError
    ? profileError
    : staff && !homeRouteFor(staff.role)
      ? "The administrator screen isn't available yet."
      : null;

  if (notice) {
    return (
      <div className="screen-wrapper flex flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm text-[var(--text-muted)]">{notice}</p>
        <button type="button" className="btn-secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="loading-pulse" aria-label="Loading" />
      </div>
    );
  }

  if (staff.role !== role) {
    return <Navigate to={homeRouteFor(staff.role)!} replace />;
  }

  return <>{children}</>;
}
