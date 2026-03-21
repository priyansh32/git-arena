import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Scenario, Session } from "@gitarena/shared";
import {
  ArrowLeft,
  Clock3,
  Flag,
  Lightbulb,
  LogOut,
  SendHorizontal,
  Terminal,
  Zap
} from "lucide-react";

import {
  fetchScenario,
  fetchSession,
  requestHint,
  submitSession,
  terminateSession
} from "../api/client";
import type { TerminalConnectionState } from "../components/SessionTerminal";

const SessionTerminal = lazy(async () => {
  const mod = await import("../components/SessionTerminal");
  return { default: mod.SessionTerminal };
});

interface RevealedHint {
  index: number;
  text: string;
}

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

function toHintLabel(index: number): string {
  return `Hint ${index}`;
}

export function SessionWorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState("00:00");
  const [revealedHints, setRevealedHints] = useState<RevealedHint[]>([]);
  const [hintLoading, setHintLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [quitLoading, setQuitLoading] = useState(false);
  const [terminalState, setTerminalState] = useState<TerminalConnectionState>("connecting");

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

    void run();
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

  const isWorkspaceLive = session?.status === "active" || session?.status === "submitted";

  useEffect(() => {
    if (isWorkspaceLive) {
      setTerminalState("connecting");
      return;
    }

    setTerminalState("closed");
  }, [isWorkspaceLive, session?.id]);

  const hintsExhausted =
    scenario !== null && session !== null && session.hintCount >= scenario.hints.length;

  const statusText = useMemo(() => {
    if (!session) {
      return "-";
    }

    return `${session.status} - hints used: ${session.hintCount}`;
  }, [session]);

  const onHint = async () => {
    if (!id || hintsExhausted) {
      return;
    }

    setHintLoading(true);
    setError(null);

    try {
      const response = await requestHint(id);
      setRevealedHints((previous) => {
        if (previous.some((hint) => hint.index === response.hintIndex)) {
          return previous;
        }

        return [...previous, { index: response.hintIndex, text: response.hint }];
      });
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
    return (
      <section className="workspace-page" aria-busy="true" aria-live="polite">
        <aside className="workspace-sidebar">
          <div className="workspace-sidebar-scroll">
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
          </div>
        </aside>
        <section className="workspace-terminal-pane">
          <header className="workspace-terminal-header">
            <div className="workspace-terminal-status">
              <span className="connection-dot connecting" />
              <span>connecting</span>
            </div>
          </header>
          <div className="workspace-terminal-body">
            <div className="terminal-placeholder">
              <p>Initializing workspace...</p>
            </div>
          </div>
        </section>
      </section>
    );
  }

  if (error && !session) {
    return (
      <section className="page">
        <article className="panel state-surface">
          <p className="state-text error">{error}</p>
          <Link className="text-link" to="/dashboard">
            <ArrowLeft aria-hidden="true" className="inline-icon" size={13} />
            Back to catalog
          </Link>
        </article>
      </section>
    );
  }

  return (
    <section className="workspace-page">
      <aside className="workspace-sidebar">
        <div className="workspace-sidebar-scroll">
          <header className="page-header">
            <h1>{scenario?.title ?? "Session"}</h1>
            <p>{scenario?.description ?? "No scenario metadata available."}</p>
          </header>

          <div>
            <p className="state-text workspace-label-with-icon">
              <Clock3 aria-hidden="true" className="inline-icon" size={13} />
              Time Remaining
            </p>
            <div className="workspace-countdown">{remaining}</div>
          </div>

          <div className="workspace-status">
            <span className={`badge ${session?.status === "active" ? "pass" : "warn"}`}>
              {session?.status ?? "unknown"}
            </span>
            <span className="mono">{statusText}</span>
          </div>

          <section className="workspace-hints">
            <h2 className="section-title-with-icon">
              <Flag aria-hidden="true" className="inline-icon" size={16} />
              Objective
            </h2>
            <p>{scenario?.objective ?? "No objective available."}</p>
          </section>

          <section className="workspace-hints">
            <h3 className="section-title-with-icon">
              <Lightbulb aria-hidden="true" className="inline-icon" size={16} />
              Hints
            </h3>
            <p className="state-text">
              Requested {revealedHints.length}/{scenario?.hints.length ?? 0}
            </p>

            {revealedHints.length === 0 ? (
              <article className="panel">
                <p className="state-text">No hints requested yet.</p>
              </article>
            ) : (
              revealedHints.map((hint, index) => (
                <details className="hint-details" key={`${hint.index}-${index}`} open={index === revealedHints.length - 1}>
                  <summary>{toHintLabel(hint.index)}</summary>
                  <p>{hint.text}</p>
                </details>
              ))
            )}
          </section>

          {error && <p className="state-text error">{error}</p>}
        </div>

        <footer className="workspace-sidebar-actions">
          <button
            className="button button-primary button-block"
            disabled={submitLoading || quitLoading || !session}
            onClick={onSubmit}
            type="button"
          >
            {!submitLoading && <SendHorizontal aria-hidden="true" className="inline-icon" size={15} />}
            {submitLoading ? "Submitting..." : "Submit"}
          </button>
          <button
            className="button button-secondary button-block"
            disabled={quitLoading || submitLoading || hintLoading}
            onClick={onQuit}
            type="button"
          >
            {!quitLoading && <LogOut aria-hidden="true" className="inline-icon" size={15} />}
            {quitLoading ? "Closing..." : "Quit"}
          </button>
        </footer>
      </aside>

      <section className="workspace-terminal-pane">
        <header className="workspace-terminal-header">
          <div className="workspace-terminal-status">
            <span className={`connection-dot ${terminalState}`} />
            <span>{terminalState}</span>
          </div>
          <button
            className="button button-secondary button-mini"
            disabled={hintLoading || submitLoading || quitLoading || hintsExhausted || !isWorkspaceLive}
            onClick={onHint}
            type="button"
          >
            {!hintLoading && !hintsExhausted && <Zap aria-hidden="true" className="inline-icon" size={13} />}
            {hintLoading ? "Loading..." : hintsExhausted ? "No Hints" : "Request Hint"}
          </button>
        </header>

        <div className="workspace-terminal-body">
          {session && isWorkspaceLive ? (
            <Suspense
              fallback={
                <div className="terminal-placeholder">
                  <p>Initializing terminal...</p>
                </div>
              }
            >
              <SessionTerminal
                onStateChange={setTerminalState}
                wsToken={session.wsToken}
                wsUrl={session.wsUrl}
              />
            </Suspense>
          ) : (
            <div className="terminal-placeholder">
              <p className="workspace-label-with-icon">
                <Terminal aria-hidden="true" className="inline-icon" size={14} />
                Workspace terminal
              </p>
              <p>Workspace is not active for this session.</p>
              <p>Start a new challenge from the catalog to launch a terminal.</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
