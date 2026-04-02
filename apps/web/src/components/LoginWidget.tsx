import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";

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

interface LoginWidgetProps {
  nextPath?: string;
  onSuccess?: () => void;
}

export function LoginWidget({ nextPath = "/dashboard", onSuccess }: LoginWidgetProps) {
  const { loginWithGoogleToken } = useAuth();
  const navigate = useNavigate();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let closed = false;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    const run = async () => {
      if (!clientId || clientId.trim().length === 0) {
        setError("Google sign-in is not configured. Please contact the administrator.");
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

            void loginWithGoogleToken(credential)
              .then(() => {
                if (onSuccess) {
                  onSuccess();
                } else {
                  navigate(nextPath, { replace: true });
                }
              })
              .catch((err) => {
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
  }, [loginWithGoogleToken, navigate, nextPath, onSuccess]);

  return (
    <div className="flex flex-col gap-4 items-center">
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

      <p className="m-0 text-xs text-text-secondary text-center leading-relaxed">
        By signing in, you agree to our{" "}
        <Link className="text-accent-primary hover:underline" to="/terms">
          Terms of Use
        </Link>{" "}
        and{" "}
        <Link className="text-accent-primary hover:underline" to="/privacy">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
