import { motion } from "framer-motion";
import { Activity } from "lucide-react";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { DEFAULT_ROUTE } from "../routes";
import { useAuth } from "../state/AuthContext";

export default function LoginView() {
  const { session, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="loading-pulse" aria-label="Loading" />
      </div>
    );
  }

  if (session) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? DEFAULT_ROUTE} replace />;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await signIn(email.trim(), password);
      navigate(DEFAULT_ROUTE, { replace: true });
    } catch {
      // deliberately vague: don't confirm which accounts exist
      setError("That email and password combination didn't work.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-viewport flex items-center justify-center px-5">
      <div className="ambient-bg" aria-hidden />

      <motion.form
        onSubmit={onSubmit}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="glass-panel relative z-10 w-full max-w-sm p-7"
      >
        <div
          className="mx-auto grid h-14 w-14 place-items-center rounded-full"
          style={{ background: "var(--c12)", color: "var(--primary-contrast)" }}
        >
          <Activity size={26} strokeWidth={2.4} />
        </div>

        <h1 className="screen-title mt-4 text-center">CareBridge</h1>
        <p className="mt-1 text-center text-[0.8rem] text-[var(--text-muted)]">
          Sign in to continue.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="field-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="field-input"
              value={email}
              autoComplete="username"
              required
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@hospital.org"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="field-input"
              value={password}
              autoComplete="current-password"
              required
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <p className="form-error">{error}</p>}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={submitting || !email || !password}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </motion.form>
    </div>
  );
}
