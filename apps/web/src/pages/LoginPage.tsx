import { useState } from "react";

import { useAuth } from "../auth/AuthContext";

const SIMULATED_GOOGLE_TOKEN = "dev:developer@gitarena.local|Local Developer";

export function LoginPage() {
  const { loginWithGoogleToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSignIn = async () => {
    setLoading(true);
    setError(null);

    try {
      await loginWithGoogleToken(SIMULATED_GOOGLE_TOKEN);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="stack">
      <div className="page-head">
        <h1>Welcome to GitArena</h1>
        <p>Local development auth mode is enabled.</p>
      </div>

      <article className="detail-card">
        <h3>Sign In</h3>
        <p>Google auth is simulated locally while we focus on core product flows.</p>
        <button className="button" disabled={loading} onClick={onSignIn} type="button">
          {loading ? "Signing in..." : "Continue with Google (Simulated)"}
        </button>
        {error && <p className="state-text error">{error}</p>}
      </article>
    </section>
  );
}
