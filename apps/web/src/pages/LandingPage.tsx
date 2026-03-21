export function LandingPage() {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary">
      <header className="border-b border-border-subtle bg-bg-base/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 md:px-8">
          <a
            className="inline-flex items-center gap-2 font-mono text-sm font-bold lowercase tracking-wide"
            href="/"
          >
            git-arena
          </a>
          <div className="inline-flex items-center gap-3">
            <a
              className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-text-primary transition-colors hover:border-accent-primary hover:bg-bg-surface-hover"
              href="/login"
            >
              Sign In
            </a>
            <a
              className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-accent-primary bg-accent-primary px-4 text-sm font-semibold text-bg-base transition-colors hover:bg-accent-hover hover:border-accent-hover"
              href="/start"
            >
              Get Started
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 md:grid-cols-2 md:items-center md:px-8 md:py-24">
          <div className="space-y-6">
            <p className="inline-flex rounded-full border border-border-strong bg-bg-surface px-3 py-1 font-mono text-xs uppercase tracking-wider text-accent-primary">
              Practice Real Git Incidents
            </p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              Build Git confidence with realistic, sandboxed scenarios
            </h1>
            <p className="max-w-xl text-base text-text-readable md:text-lg">
              GitArena gives engineers hands-on drills for rebases, conflict recovery, history
              cleanup, and branch rescue workflows in isolated workspaces.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                className="inline-flex min-h-[42px] items-center justify-center rounded-lg border border-accent-primary bg-accent-primary px-5 text-sm font-semibold text-bg-base transition-colors hover:bg-accent-hover hover:border-accent-hover"
                href="/start"
              >
                Start
              </a>
              <a
                className="inline-flex min-h-[42px] items-center justify-center rounded-lg border border-border-strong px-5 text-sm font-semibold text-text-primary transition-colors hover:border-accent-primary hover:bg-bg-surface-hover"
                href="#how-it-works"
              >
                See how it works
              </a>
            </div>
          </div>
          <div className="rounded-2xl border border-border-subtle bg-bg-surface p-6 shadow-2xl shadow-black/40">
            <p className="mb-4 font-mono text-xs uppercase tracking-wider text-text-secondary">
              Why teams use GitArena
            </p>
            <div className="space-y-3">
              <div className="rounded-lg border border-border-subtle bg-bg-base/60 p-4">
                <p className="text-sm font-semibold">Safe Failure Environment</p>
                <p className="mt-1 text-sm text-text-secondary">
                  Train on hard Git workflows without risking production repositories.
                </p>
              </div>
              <div className="rounded-lg border border-border-subtle bg-bg-base/60 p-4">
                <p className="text-sm font-semibold">Scenario-Based Progression</p>
                <p className="mt-1 text-sm text-text-secondary">
                  Move from common incidents to advanced recovery situations.
                </p>
              </div>
              <div className="rounded-lg border border-border-subtle bg-bg-base/60 p-4">
                <p className="text-sm font-semibold">Instant Result Feedback</p>
                <p className="mt-1 text-sm text-text-secondary">
                  Submit your solution and get pass/fail checks with clear assertions.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border-subtle bg-bg-surface/40">
          <div className="mx-auto w-full max-w-7xl px-4 py-14 md:px-8">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Practice what actually breaks in day-to-day engineering work
            </h2>
            <p className="mt-3 max-w-3xl text-text-readable">
              From detached HEAD recovery to rebase conflict chains, GitArena helps engineers
              rehearse repeatable resolution patterns so they can recover quickly during real
              incidents.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-16 md:px-8">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Feature highlights</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <article className="rounded-xl border border-border-subtle bg-bg-surface p-6">
              <h3 className="text-lg font-semibold">Scenario Catalog</h3>
              <p className="mt-2 text-sm text-text-secondary">
                Browse scenarios by difficulty, commonality, and tags to target specific skills.
              </p>
            </article>
            <article className="rounded-xl border border-border-subtle bg-bg-surface p-6">
              <h3 className="text-lg font-semibold">Isolated Workspaces</h3>
              <p className="mt-2 text-sm text-text-secondary">
                Every session runs in a contained environment so practice stays safe and repeatable.
              </p>
            </article>
            <article className="rounded-xl border border-border-subtle bg-bg-surface p-6">
              <h3 className="text-lg font-semibold">Assertion-Based Evaluation</h3>
              <p className="mt-2 text-sm text-text-secondary">
                Each submission is validated against explicit checks so results are objective.
              </p>
            </article>
          </div>
        </section>

        <section
          className="mx-auto w-full max-w-7xl px-4 pb-16 md:px-8"
          id="how-it-works"
        >
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">How it works</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            <li className="rounded-xl border border-border-subtle bg-bg-surface p-6">
              <p className="font-mono text-xs uppercase tracking-wider text-accent-primary">
                Step 1
              </p>
              <h3 className="mt-2 text-lg font-semibold">Pick a scenario</h3>
              <p className="mt-2 text-sm text-text-secondary">
                Choose a Git incident from the catalog based on your skill level.
              </p>
            </li>
            <li className="rounded-xl border border-border-subtle bg-bg-surface p-6">
              <p className="font-mono text-xs uppercase tracking-wider text-accent-primary">
                Step 2
              </p>
              <h3 className="mt-2 text-lg font-semibold">Solve in terminal</h3>
              <p className="mt-2 text-sm text-text-secondary">
                Work through the objective in a live terminal session with realistic repo state.
              </p>
            </li>
            <li className="rounded-xl border border-border-subtle bg-bg-surface p-6">
              <p className="font-mono text-xs uppercase tracking-wider text-accent-primary">
                Step 3
              </p>
              <h3 className="mt-2 text-lg font-semibold">Submit and review</h3>
              <p className="mt-2 text-sm text-text-secondary">
                Submit your solution and review assertion results to reinforce the workflow.
              </p>
            </li>
          </ol>
        </section>

        <section className="border-t border-border-subtle bg-bg-surface/40">
          <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-4 px-4 py-14 md:flex-row md:items-center md:justify-between md:px-8">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Ready to train your Git instincts?</h2>
              <p className="mt-2 text-text-secondary">
                Start a session and practice real workflows end-to-end.
              </p>
            </div>
            <a
              className="inline-flex min-h-[42px] items-center justify-center rounded-lg border border-accent-primary bg-accent-primary px-5 text-sm font-semibold text-bg-base transition-colors hover:bg-accent-hover hover:border-accent-hover"
              href="/start"
            >
              Get Started
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-text-secondary md:px-8">
          <p className="m-0">© {new Date().getFullYear()} git-arena</p>
          <div className="inline-flex items-center gap-4">
            <a className="hover:text-text-primary" href="/start">
              Start
            </a>
            <a className="hover:text-text-primary" href="/login">
              Login
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
