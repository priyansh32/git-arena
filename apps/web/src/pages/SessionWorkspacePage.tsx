import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Scenario, Session } from "@gitarena/shared";

import {
  fetchScenario,
  fetchSession,
  requestHint,
  submitSession,
  terminateSession
} from "../api/client";

function getRemainingLabel(expiresAt: string): string {
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  if (remainingMs <= 0) {
    return "00:00";
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${minutes}:${seconds}`;
}

export function SessionWorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState("00:00");
  const [hintText, setHintText] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [quitLoading, setQuitLoading] = useState(false);

  useEffect(() => {
    if (!id) {
      setError("Session ID is missing");
      setLoading(false);
      return;
    }

    const run = async () => {
      try {
        const loadedSession = await fetchSession(id);
        setSession(loadedSession);
        setRemaining(getRemainingLabel(loadedSession.expiresAt));

        const loadedScenario = await fetchScenario(loadedSession.scenarioId);
        setScenario(loadedScenario);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load session");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [id]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const interval = window.setInterval(() => {
      setRemaining(getRemainingLabel(session.expiresAt));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [session]);

  const statusText = useMemo(() => {
    if (!session) {
      return "-";
    }

    return `${session.status} • ${remaining} • hints: ${session.hintCount}`;
  }, [remaining, session]);

  const onHint = async () => {
    if (!id) {
      return;
    }

    setHintLoading(true);
    setError(null);

    try {
      const response = await requestHint(id);
      setHintText(`Hint ${response.hintIndex}: ${response.hint}`);
      setSession(response.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request hint");
    } finally {
      setHintLoading(false);
    }
  };

  const onSubmit = async () => {
    if (!id) {
      return;
    }

    setSubmitLoading(true);
    setError(null);

    try {
      await submitSession(id);
      navigate(`/sessions/${id}/result`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit session");
    } finally {
      setSubmitLoading(false);
    }
  };

  const onQuit = async () => {
    if (!id) {
      navigate("/dashboard");
      return;
    }

    setQuitLoading(true);
    setError(null);

    try {
      await terminateSession(id);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to terminate session");
      navigate("/dashboard");
    } finally {
      setQuitLoading(false);
    }
  };

  if (loading) {
    return <p className="state-text">Loading workspace...</p>;
  }

  if (error && !session) {
    return (
      <div className="stack">
        <p className="state-text error">{error}</p>
        <Link className="link" to="/dashboard">
          Back to catalog
        </Link>
      </div>
    );
  }

  return (
    <section className="workspace">
      <header className="workspace-head">
        <div>
          <h1>{scenario?.title ?? "Session"}</h1>
          <p>{statusText}</p>
        </div>
        <button
          className="button subtle"
          disabled={quitLoading || submitLoading || hintLoading}
          onClick={onQuit}
          type="button"
        >
          {quitLoading ? "Closing..." : "Quit"}
        </button>
      </header>

      <div className="workspace-grid">
        <div className="terminal-panel">
          <div className="terminal-header">Terminal</div>
          <div className="terminal-body">
            <p>xterm.js + WebSocket wiring is next.</p>
            <p>WS URL placeholder: {session?.wsUrl}</p>
            <p>WS token placeholder: {session?.wsToken}</p>
          </div>
        </div>

        <aside className="objective-panel">
          <h2>Objective</h2>
          <p>{scenario?.objective ?? "No objective available."}</p>

          {hintText && <p className="hint-block">{hintText}</p>}
          {error && <p className="state-text error">{error}</p>}

          <div className="panel-actions">
            <button
              className="button subtle"
              disabled={hintLoading || submitLoading}
              onClick={onHint}
              type="button"
            >
              {hintLoading ? "Loading hint..." : "Hint"}
            </button>
            <button className="button" disabled={submitLoading} onClick={onSubmit} type="button">
              {submitLoading ? "Submitting..." : "Submit"}
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
