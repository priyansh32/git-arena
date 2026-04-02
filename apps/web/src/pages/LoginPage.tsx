import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GitBranch } from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { LoginWidget } from "../components/LoginWidget";

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
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = useMemo(
    () => resolveNextPath(searchParams.get("next")),
    [searchParams]
  );

  useEffect(() => {
    if (!authLoading && user) {
      navigate(nextPath, { replace: true });
    }
  }, [authLoading, navigate, nextPath, user]);

  return (
    <section className="w-full max-w-[440px] mx-auto flex flex-col gap-6">
      <article className="bg-bg-surface border border-border-subtle rounded-xl p-8 flex flex-col gap-6 shadow-lg">
        <div className="flex flex-col gap-2">
          <p className="m-0 flex items-center gap-2 text-accent-primary font-mono text-sm font-bold lowercase tracking-wider">
            <GitBranch aria-hidden="true" className="shrink-0" size={16} />
            git-arena
          </p>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.125rem)] leading-[1.2] font-bold tracking-tight">Practice Real Git Workflows</h1>
          <p className="m-0 text-text-secondary text-base">Sign in with Google to launch your hands-on Git recovery workspace.</p>
        </div>

        <LoginWidget nextPath={nextPath} />
      </article>
    </section>
  );
}
