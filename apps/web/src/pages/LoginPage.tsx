import { useEffect, useRef, useState } from "react";

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

export function LoginPage() {
  const { loginWithGoogleToken } = useAuth();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
          theme: "outline",
          width: 320
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
    <section className="stack">
      <div className="page-head">
        <h1>Welcome to GitArena</h1>
        <p>Sign in with Google to launch isolated Git challenge sessions.</p>
      </div>

      <article className="detail-card">
        <h3>Sign In</h3>
        <div ref={mountRef} />
        {loading && <p className="state-text">Loading Google sign-in...</p>}
        {error && <p className="state-text error">{error}</p>}
      </article>
    </section>
  );
}
