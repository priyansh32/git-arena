import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Scenario, Session } from "@gitarena/shared";
import {
  ArrowLeft,
  Clock3,
  Flag,
  Lightbulb,
  LogOut,
  RefreshCw,
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

export function SessionWorkspacePage() {
  const { id } = useParams<{ id: string }>();
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
  const [terminalInstanceKey, setTerminalInstanceKey] = useState(0);

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

  const onReconnectTerminal = () => {
    if (!isWorkspaceLive) {
      return;
    }

    setTerminalState("connecting");
    setTerminalInstanceKey((previous) => previous + 1);
  };

  if (loading) {
    return (
      <section className="flex flex-col lg:flex-row h-full w-full" aria-busy="true" aria-live="polite">
        <aside className="flex flex-col border-b lg:border-b-0 lg:border-r border-border-subtle bg-bg-surface w-full lg:w-[340px] max-h-[40vh] lg:max-h-none shrink-0">
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 scrollbar-hide">
            <div className="skeleton h-32 rounded-xl" />
            <div className="skeleton h-48 rounded-xl" />
            <div className="skeleton h-24 rounded-xl" />
          </div>
        </aside>
        <section className="flex-1 flex flex-col min-h-0 bg-bg-base">
          <header className="flex items-center justify-between p-2 lg:p-4 bg-bg-surface-soft border-b border-border-subtle shrink-0 min-h-[56px]">
            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-text-secondary">
              <span className="w-2 h-2 rounded-full bg-status-warn shadow-[0_0_0_2px_rgba(245,158,11,0.2)]" />
              Connecting...
            </div>
          </header>
          <div className="flex-1 bg-black relative min-h-0">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-text-secondary font-mono">
              Terminal loading...
            </div>
          </div>
        </section>
      </section>
    );
  }

  if (error && !session) {
    return (
      <section className="flex flex-col gap-6 w-full max-w-7xl mx-auto p-4 lg:p-8">
        <article className="flex flex-col items-center justify-center gap-4 min-h-[120px] p-8 text-center bg-bg-surface border border-border-subtle rounded-xl">
          <p className="m-0 text-status-fail">{error}</p>
          <Link className="inline-flex items-center gap-1.5 text-accent-primary font-semibold hover:text-accent-hover hover:underline" to="/dashboard">
            <ArrowLeft aria-hidden="true" className="shrink-0" size={13} />
            Return to Dashboard
          </Link>
        </article>
      </section>
    );
  }

  return (
    <section className="flex flex-col lg:flex-row h-full w-full">
      <aside className="flex flex-col border-b lg:border-b-0 lg:border-r border-border-subtle bg-bg-surface w-full lg:w-[340px] max-h-[44vh] lg:max-h-none shrink-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 flex flex-col gap-6 scrollbar-hide">
          <header className="flex flex-col gap-2">
            <h1 className="m-0 text-xl font-bold tracking-tight leading-tight">
              {scenario?.title ?? "Session"}
            </h1>
            <p className="m-0 text-text-secondary text-sm">{scenario?.description ?? "No scenario metadata available."}</p>
          </header>

          <div className="flex flex-col gap-3">
            <p className="m-0 flex items-center gap-2 text-sm text-text-secondary">
              <Clock3 aria-hidden="true" className="shrink-0" size={13} />
              Time Remaining
            </p>
            <div className="inline-flex items-center justify-center w-fit px-4 py-2 bg-bg-surface-soft border border-border-strong rounded-lg font-mono text-2xl font-bold tracking-wider shadow-inner">
              {remaining}
            </div>
            <div className="flex items-center gap-2 text-sm text-text-secondary mt-1">
              <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider border leading-none ${session?.status === 'active' ? 'text-status-pass bg-status-pass-bg border-status-pass-border' : 'text-status-warn bg-status-warn-bg border-status-warn-border'}`}>
                {session?.status ?? "unknown"}
              </span>
              <span className="font-mono text-xs">{statusText}</span>
            </div>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="m-0 flex items-center gap-2 text-lg font-bold">
              <Flag aria-hidden="true" className="shrink-0 text-accent-primary" size={16} />
              Objective
            </h2>
            <div className="bg-bg-surface-soft border border-border-strong rounded-xl p-4 text-sm leading-relaxed text-text-primary">
              {scenario?.objective ?? "No objective available."}
            </div>
          </section>

          <section className="flex flex-col gap-3 pb-2">
            <h3 className="m-0 flex items-center gap-2 text-lg font-bold">
              <Lightbulb aria-hidden="true" className="shrink-0 text-status-warn" size={16} />
              Hints ({revealedHints.length} / {scenario?.hints.length ?? 0})
            </h3>
            <p className="m-0 text-text-secondary text-sm">
              Need help? Requesting a hint reduces your maximum possible score.
            </p>

            <div className="flex flex-col gap-2 mt-2">
              {revealedHints.length === 0 ? (
                <div className="bg-bg-surface-soft border border-border-strong rounded-xl p-4 text-center">
                  <p className="m-0 text-text-secondary text-sm">No hints requested yet.</p>
                </div>
              ) : (
                revealedHints.map((hint, index) => (
                  <details className="bg-bg-surface-soft border border-border-strong rounded-lg overflow-hidden [&_summary::-webkit-details-marker]:hidden open:border-accent-primary" key={`${hint.index}-${index}`} open={index === revealedHints.length - 1}>
                    <summary className="p-3 font-mono text-xs font-bold uppercase tracking-wider text-accent-primary cursor-pointer select-none hover:bg-bg-surface-hover/50 transition-colors">
                      Hint #{hint.index + 1}
                    </summary>
                    <p className="m-0 px-3 pb-3 text-sm text-text-primary leading-relaxed">{hint.text}</p>
                  </details>
                ))
              )}
            </div>
          </section>

          {error && <p className="m-0 text-status-fail bg-status-fail-bg border border-status-fail-border p-3 rounded-lg text-sm mt-auto">{error}</p>}
        </div>

        <footer className="p-4 lg:p-6 border-t border-border-subtle bg-bg-surface shrink-0 flex flex-col gap-3 z-10">
          <button
            className="inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 bg-accent-primary text-bg-base hover:bg-accent-hover rounded-md text-sm font-bold min-h-[44px] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={submitLoading || quitLoading || !session}
            onClick={() => void onSubmit()}
            type="button"
          >
            {submitLoading ? "Submitting..." : "Submit Solution"}
            {!submitLoading && <SendHorizontal aria-hidden="true" className="shrink-0" size={16} />}
          </button>
          <button
            className="inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 bg-transparent border border-border-strong text-text-primary hover:border-accent-primary hover:bg-bg-surface-hover rounded-md text-sm font-bold min-h-[44px] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={quitLoading || submitLoading || hintLoading}
            onClick={() => void onQuit()}
            type="button"
          >
            {quitLoading ? "Quitting..." : "Quit Session"}
            {!quitLoading && <LogOut aria-hidden="true" className="shrink-0" size={16} />}
          </button>
        </footer>
      </aside>

      <section className="flex-1 flex flex-col min-h-0 bg-bg-base relative overflow-hidden">
        <header className="flex items-center justify-between p-2 lg:p-4 bg-bg-surface-soft border-b border-border-subtle shrink-0 min-h-[56px] z-10">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-text-secondary">
            <span className={`w-2 h-2 rounded-full ${terminalState === 'connected' ? 'bg-status-pass shadow-[0_0_0_2px_rgba(16,185,129,0.2)]' : terminalState === 'connecting' ? 'bg-status-warn shadow-[0_0_0_2px_rgba(245,158,11,0.2)]' : 'bg-status-fail shadow-[0_0_0_2px_rgba(239,68,68,0.2)]'}`} />
            {terminalState}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-transparent border border-border-strong text-text-primary hover:border-accent-primary hover:bg-bg-surface-hover rounded-md font-mono text-xs uppercase tracking-wider transition-colors min-h-[32px] disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!isWorkspaceLive || terminalState === "connecting"}
              onClick={onReconnectTerminal}
              type="button"
            >
              Reconnect
              <RefreshCw aria-hidden="true" className="shrink-0" size={13} />
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-transparent border border-border-strong text-text-primary hover:border-accent-primary hover:bg-bg-surface-hover rounded-md font-mono text-xs uppercase tracking-wider transition-colors min-h-[32px] disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={hintLoading || submitLoading || quitLoading || hintsExhausted || !isWorkspaceLive}
              onClick={() => void onHint()}
              type="button"
            >
              {hintLoading ? "..." : hintsExhausted ? "No hints left" : "Request Hint"}
              {!hintLoading && !hintsExhausted && <Zap aria-hidden="true" className="shrink-0 text-status-warn" size={14} />}
            </button>
          </div>
        </header>

        <div className="flex-1 bg-black relative min-h-0 overflow-hidden">
          {session && isWorkspaceLive ? (
            <Suspense
              fallback={
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-text-secondary font-mono">
                  Initializing terminal...
                </div>
              }
            >
              <SessionTerminal
                key={terminalInstanceKey}
                onStateChange={setTerminalState}
                wsToken={session.wsToken}
                wsUrl={session.wsUrl}
              />
            </Suspense>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-text-secondary font-mono text-center p-8 bg-black/80 backdrop-blur-sm z-20">
              <Terminal aria-hidden="true" className="shrink-0 text-border-strong mb-2" size={48} />
              <p className="m-0 text-lg">Workspace is not active for this session.</p>
              <p className="m-0 text-sm opacity-70">Start a new challenge from the catalog to launch a terminal.</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
