import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getCurrentShift, getMe } from "../api/client";
import { supabase } from "../lib/supabase";
import type { Shift, Staff } from "../api/types";

type AuthState = {
  session: Session | null;
  staff: Staff | null;
  shift: Shift | null;
  /** True until the stored session has been checked — render nothing routed until then. */
  loading: boolean;
  profileError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshShift: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setStaff(null);
        setShift(null);
        setProfileError(null);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // Once signed in, load the ward profile and open the shift. A nurse who
  // authenticates but has no staff row is signed in to nothing useful, so we
  // surface that rather than dropping her into an empty app.
  useEffect(() => {
    if (!session) return;
    let active = true;

    (async () => {
      try {
        const me = await getMe();
        if (!active) return;
        setStaff(me.staff);
        setProfileError(null);

        if (me.staff.role === "nurse") {
          const current = me.active_shift ?? (await getCurrentShift()).shift;
          if (active) setShift(current);
        }
      } catch {
        if (!active) return;
        setProfileError(
          "Signed in, but no ward profile is linked to this account. Ask an administrator to add you.",
        );
      }
    })();

    return () => {
      active = false;
    };
  }, [session]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refreshShift = useCallback(async () => {
    const { shift: next } = await getCurrentShift();
    setShift(next);
  }, []);

  const value = useMemo(
    () => ({
      session,
      staff,
      shift,
      loading,
      profileError,
      signIn,
      signOut,
      refreshShift,
    }),
    [session, staff, shift, loading, profileError, signIn, signOut, refreshShift],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
