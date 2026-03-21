import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GitBranch, LogIn } from "lucide-react";

import { useAuth } from "../auth/AuthContext";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            ux_mode?: "popup" | "redirect";
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: Record<string, string | number | boolean>
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load Google script")), {
        once: true
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Google script"));
    document.head.appendChild(script);
  });
}

function resolveNextPath(value: string | null): string {
  if (!value) {
    return "/dashboard";
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

export function LoginPage() {
  const { loginWithGoogleToken, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const nextPath = useMemo(
    () => resolveNextPath(searchParams.get("next")),
    [searchParams]
  );

  useEffect(() => {
    if (!authLoading && user) {
      navigate(nextPath, { replace: true });
    }
  }, [authLoading, navigate, nextPath, user]);

  useEffect(() => {
    let closed = false;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    const run = async () => {
      if (!clientId || clientId.trim().length === 0) {
        setError("Missing VITE_GOOGLE_CLIENT_ID in frontend runtime environment.");
        setLoading(false);
        return;
      }

      try {
        await loadGoogleScript();
        if (closed || !mountRef.current || !window.google?.accounts?.id) {
          return;
        }

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            const credential = response.credential;
            if (!credential) {
              setError("Google sign-in did not return a credential.");
              return;
            }

            void loginWithGoogleToken(credential).catch((err) => {
              setError(err instanceof Error ? err.message : "Google sign-in failed");
            });
          },
          ux_mode: "popup"
        });

        mountRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(mountRef.current, {
          type: "standard",
          shape: "pill",
          size: "large",
          text: "signin_with",
          logo_alignment: "left",
          theme: "filled_blue",
          width: 340
        });
        window.google.accounts.id.prompt();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Google sign-in is unavailable");
      } finally {
        setLoading(false);
      }
    };

    void run();

    return () => {
      closed = true;
    };
  }, [loginWithGoogleToken]);

  return (
    <section className="w-full max-w-[440px] mx-auto flex flex-col gap-6">
      <article className="bg-bg-surface border border-border-subtle rounded-xl p-8 flex flex-col gap-6 shadow-lg">
        <div className="flex flex-col gap-2">
          <p className="m-0 flex items-center gap-2 text-accent-primary font-mono text-sm font-bold lowercase tracking-wider">
            <GitBranch aria-hidden="true" className="shrink-0" size={16} />
            git-arena
          </p>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.125rem)] leading-[1.2] font-bold tracking-tight">Practice Real Git Workflows</h1>
          <p className="m-0 text-text-secondary text-base">Sign in with Google to start an isolated git-arena session.</p>
        </div>

        <div className="min-h-[44px] flex justify-center items-center relative" ref={mountRef} />
        
        {loading && (
          <p className="m-0 text-text-secondary flex items-center gap-2 text-sm justify-center">
            <LogIn aria-hidden="true" className="shrink-0" size={14} />
            Loading Google sign-in...
          </p>
        )}
        
        {error && (
          <p className="m-0 text-status-fail bg-status-fail-bg border border-status-fail-border p-3 rounded-lg text-sm text-center">
            {error}
          </p>
        )}
      </article>
    </section>
  );
}
