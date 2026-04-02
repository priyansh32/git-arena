import {
  GitBranch,
  GitCommit,
  Play,
  Shield,
  TerminalSquare,
  ArrowRight,
  CheckCircle2,
  Trophy,
  Linkedin,
  Twitter
} from "lucide-react";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary selection:bg-accent-primary/30 flex flex-col font-sans">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border-subtle bg-bg-base/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a
            className="flex items-center gap-2 font-mono text-base font-bold lowercase tracking-wide text-text-primary hover:text-accent-primary transition-colors group"
            href="/"
          >
            <GitBranch aria-hidden="true" className="shrink-0 text-accent-primary group-hover:scale-110 transition-transform" size={18} />
            git-arena
          </a>
          <nav className="flex items-center gap-3 sm:gap-4">
            <a
              className="inline-flex h-9 items-center justify-center rounded-lg border border-transparent px-4 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary hover:bg-bg-surface-hover"
              href="/login"
            >
              Sign In
            </a>
            <a
              className="inline-flex h-9 items-center justify-center rounded-lg border border-accent-primary bg-accent-primary/10 px-4 text-sm font-bold text-accent-primary transition-all hover:bg-accent-primary hover:text-bg-base shadow-[0_0_15px_rgba(6,182,212,0.15)] hover:shadow-[0_0_20px_rgba(6,182,212,0.3)]"
              href="/library"
            >
              Get Started
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-border-subtle bg-bg-surface/30">
          {/* Background gradients */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent-primary/10 via-bg-base/50 to-bg-base pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-accent-primary/10 blur-[120px] rounded-full pointer-events-none" />
          
          <div className="relative mx-auto w-full max-w-7xl px-4 py-20 sm:py-28 lg:px-8 lg:py-32">
            <div className="flex flex-col items-center text-center max-w-3xl mx-auto space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-accent-primary/30 bg-accent-primary/5 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-widest text-accent-primary backdrop-blur-sm shadow-[0_0_10px_rgba(6,182,212,0.1)]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-primary"></span>
                </span>
                Practice Real Git Incidents
              </div>
              
              <h1 className="text-[clamp(2.5rem,5vw,4.5rem)] font-extrabold leading-[1.1] tracking-tight text-text-primary drop-shadow-sm">
                Master Git workflows without the <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-primary to-[#7fe5f7]">production panic.</span>
              </h1>
              
                <p className="text-lg sm:text-xl text-text-readable leading-relaxed max-w-2xl mx-auto">
                  <a
                    className="inline-flex items-center gap-2 whitespace-nowrap align-middle font-mono font-bold lowercase tracking-wide text-text-primary hover:text-accent-primary transition-colors group"
                    href="/"
                  >
                    <GitBranch
                      aria-hidden="true"
                      className="shrink-0 text-accent-primary group-hover:scale-110 transition-transform h-[1em] w-[1em]"
                    />
                    <span className="whitespace-nowrap leading-none">git-arena</span>
                  </a>{" "}
                  gives engineers safe, sandboxed environments to practice complex rebases,
                  history rewrites, and catastrophic conflict recovery before they happen on
                  the job.
                </p>
                              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto pt-4">
                <a
                  className="inline-flex w-full sm:w-auto h-12 items-center justify-center gap-2 rounded-lg bg-accent-primary px-8 text-sm font-bold text-bg-base transition-all hover:bg-accent-hover hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_20px_rgba(6,182,212,0.2)]"
                  href="/library"
                >
                  Start Training Now
                  <ArrowRight size={16} strokeWidth={2.5} />
                </a>
                <a
                  className="inline-flex w-full sm:w-auto h-12 items-center justify-center gap-2 rounded-lg border border-border-strong bg-bg-surface px-8 text-sm font-bold text-text-primary transition-colors hover:border-accent-primary/50 hover:bg-bg-surface-hover"
                  href="#how-it-works"
                >
                  See How It Works
                </a>
              </div>
            </div>
            
            {/* Abstract visual representation of terminal/git */}
            <div className="mt-20 mx-auto max-w-4xl relative rounded-xl border border-border-strong bg-black/60 shadow-2xl shadow-black/80 overflow-hidden ring-1 ring-white/5 backdrop-blur-xl">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border-strong bg-bg-surface-soft/80">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                  <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                </div>
                <div className="mx-auto font-mono text-[10px] text-text-secondary uppercase tracking-widest flex items-center gap-2">
                  <TerminalSquare size={12} />
                  workspace: scenario-rebase-conflict
                </div>
              </div>
              <div className="p-6 font-mono text-sm leading-relaxed text-text-readable overflow-x-auto">
                <p className="flex gap-4"><span className="text-accent-primary select-none">➜</span><span className="text-[#a855f7]">~</span><span className="text-text-primary">git rebase main</span></p>
                <p className="text-status-warn mt-1">Auto-merging src/api/client.ts</p>
                <p className="text-status-fail">CONFLICT (content): Merge conflict in src/api/client.ts</p>
                <p className="text-text-secondary mt-1">error: could not apply 3b41d16... Update client methods</p>
                <p className="text-text-secondary mt-1">Resolve all conflicts manually, mark them as resolved with</p>
                <p className="text-text-secondary">"git add/rm &lt;conflicted_files&gt;", then run "git rebase --continue".</p>
                <p className="flex gap-4 mt-4"><span className="text-accent-primary select-none">➜</span><span className="text-[#a855f7]">~</span><span className="text-text-primary border-r-2 border-accent-primary animate-pulse w-fit pr-1">git status</span></p>
              </div>
            </div>
          </div>
        </section>

        {/* Value Prop Section */}
        <section className="py-20 sm:py-32 bg-bg-base border-b border-border-subtle relative">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                Stop practicing on production code.
              </h2>
              <p className="text-lg text-text-readable">
                Reading documentation doesn't build muscle memory. Real engineering requires hands-on experience recovering from actual mess-ups in a zero-risk environment.
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              <article className="flex flex-col gap-4 p-8 rounded-2xl border border-border-subtle bg-bg-surface transition-colors hover:border-border-strong group">
                <div className="w-12 h-12 rounded-xl bg-accent-primary/10 flex items-center justify-center border border-accent-primary/20 text-accent-primary group-hover:scale-110 transition-transform">
                  <Shield size={24} strokeWidth={2} />
                </div>
                <h3 className="text-xl font-bold">100% Isolated Workspaces</h3>
                <p className="text-text-secondary leading-relaxed">
                  Every session spins up a dedicated container with a pre-configured, broken git repository. Break it further? Just hit restart. Zero risk to your real codebase.
                </p>
              </article>
              
              <article className="flex flex-col gap-4 p-8 rounded-2xl border border-border-subtle bg-bg-surface transition-colors hover:border-border-strong group">
                <div className="w-12 h-12 rounded-xl bg-status-pass-bg flex items-center justify-center border border-status-pass-border text-status-pass group-hover:scale-110 transition-transform">
                  <GitCommit size={24} strokeWidth={2} />
                </div>
                <h3 className="text-xl font-bold">Curated Incident Catalog</h3>
                <p className="text-text-secondary leading-relaxed">
                  Train on the exact scenarios that block teams daily. From detached heads to accidental history deletion, progress from common hiccups to advanced recovery.
                </p>
              </article>
              
              <article className="flex flex-col gap-4 p-8 rounded-2xl border border-border-subtle bg-bg-surface transition-colors hover:border-border-strong group">
                <div className="w-12 h-12 rounded-xl bg-[#a855f7]/10 flex items-center justify-center border border-[#a855f7]/20 text-[#a855f7] group-hover:scale-110 transition-transform">
                  <CheckCircle2 size={24} strokeWidth={2} />
                </div>
                <h3 className="text-xl font-bold">Assertion-Based Scoring</h3>
                <p className="text-text-secondary leading-relaxed">
                  Don't guess if you did it right. Submit your workspace state and our engine runs strict assertions against the repository history to verify your solution.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="py-20 sm:py-32 bg-bg-surface/30">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row gap-12 lg:gap-24 items-center">
              <div className="flex-1 space-y-8">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-bg-surface px-3 py-1 mb-6 font-mono text-[11px] font-semibold uppercase tracking-widest text-text-secondary">
                    The Workflow
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
                    A realistic loop designed for retention.
                  </h2>
                  <p className="text-lg text-text-readable">
                    We designed git-arena to mimic the exact feedback loop you experience when fixing git issues in your day job, minus the stress.
                  </p>
                </div>
                
                <ol className="relative border-l-2 border-border-strong ml-3 space-y-10">
                  <li className="pl-8 relative">
                    <span className="absolute flex items-center justify-center w-8 h-8 rounded-full -left-[17px] ring-4 ring-bg-base bg-bg-surface border border-accent-primary text-accent-primary font-mono text-sm font-bold shadow-[0_0_10px_rgba(6,182,212,0.2)]">1</span>
                    <h3 className="text-xl font-bold mb-2">Select your objective</h3>
                    <p className="text-text-secondary text-base">Browse the catalog of real-world scenarios. Read the briefing, understand the broken state, and review available hints before starting.</p>
                  </li>
                  <li className="pl-8 relative">
                    <span className="absolute flex items-center justify-center w-8 h-8 rounded-full -left-[17px] ring-4 ring-bg-base bg-bg-surface border border-accent-primary text-accent-primary font-mono text-sm font-bold shadow-[0_0_10px_rgba(6,182,212,0.2)]">2</span>
                    <h3 className="text-xl font-bold mb-2">Fix it in the terminal</h3>
                    <p className="text-text-secondary text-base">We provision a live container and drop you into a web-based terminal attached to the broken repository. Use standard git CLI commands to resolve the issue.</p>
                  </li>
                  <li className="pl-8 relative">
                    <span className="absolute flex items-center justify-center w-8 h-8 rounded-full -left-[17px] ring-4 ring-bg-base bg-bg-surface border border-accent-primary text-accent-primary font-mono text-sm font-bold shadow-[0_0_10px_rgba(6,182,212,0.2)]">3</span>
                    <h3 className="text-xl font-bold mb-2">Submit & Evaluate</h3>
                    <p className="text-text-secondary text-base">Submit your session to trigger the evaluation engine. Review a detailed breakdown of which assertions passed or failed to understand your mistakes.</p>
                  </li>
                </ol>
              </div>
              
              <div className="flex-1 w-full max-w-lg lg:max-w-none relative">
                {/* Decorative abstract elements */}
                <div className="absolute -inset-4 bg-gradient-to-tr from-accent-primary/20 to-transparent blur-2xl rounded-[3rem] -z-10" />
                <div className="rounded-2xl border border-border-strong bg-bg-base p-2 shadow-2xl">
                  <div className="rounded-xl border border-border-subtle bg-bg-surface overflow-hidden">
                    <div className="p-4 border-b border-border-subtle bg-bg-surface-soft flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Trophy size={16} className="text-status-pass" />
                        <span className="font-mono text-xs font-bold text-text-primary">Evaluation Result</span>
                      </div>
                      <span className="font-mono text-[10px] font-bold px-2 py-1 rounded-full bg-status-pass-bg text-status-pass border border-status-pass-border uppercase tracking-wider">Pass</span>
                    </div>
                    <div className="p-4 space-y-3 bg-bg-base">
                      <div className="flex items-start gap-3 p-3 rounded-lg border border-border-subtle bg-bg-surface">
                        <CheckCircle2 size={16} className="text-status-pass shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-text-primary mb-1">Feature branch rebased</p>
                          <p className="text-xs text-text-secondary">Branch 'feature-x' correctly rebased onto 'main'</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 rounded-lg border border-border-subtle bg-bg-surface">
                        <CheckCircle2 size={16} className="text-status-pass shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-text-primary mb-1">Conflicts resolved</p>
                          <p className="text-xs text-text-secondary">No conflict markers remaining in repository files</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 rounded-lg border border-border-subtle bg-bg-surface">
                        <CheckCircle2 size={16} className="text-status-pass shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-text-primary mb-1">History preserved</p>
                          <p className="text-xs text-text-secondary">Original commit messages and authors maintained</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="relative py-24 sm:py-32 overflow-hidden border-t border-border-subtle bg-bg-base">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-accent-primary/10 via-bg-base to-bg-base pointer-events-none" />
          
          <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center space-y-8">
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight">
              Ready to train your Git instincts?
            </h2>
            <p className="text-lg sm:text-xl text-text-readable max-w-2xl mx-auto">
              Join developers building confidence in complex version control workflows. Start your first scenario in seconds.
            </p>
            <div className="pt-4">
              <a
                className="inline-flex h-14 items-center justify-center gap-3 rounded-lg bg-accent-primary px-10 text-base font-bold text-bg-base transition-all hover:bg-accent-hover hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_30px_rgba(6,182,212,0.3)]"
                href="/library"
              >
                <Play size={18} className="fill-bg-base" />
                Launch First Workspace
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border-subtle bg-bg-surface/50">
        <div className="mx-auto flex w-full max-w-7xl flex-col sm:flex-row items-start sm:items-center justify-between gap-6 px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 font-mono text-sm font-bold lowercase tracking-wide text-text-secondary">
              <GitBranch aria-hidden="true" size={16} />
              git-arena © {new Date().getFullYear()}
            </div>
            <p className="m-0 text-xs text-text-secondary">
              Built by{" "}
              <a
                className="font-mono text-text-primary hover:text-accent-primary transition-colors"
                href="https://www.linkedin.com/in/priyansh32/"
                rel="noreferrer"
                target="_blank"
              >
                Priyansh
              </a>{" "}
              for free developer practice.
            </p>
            <div className="flex items-center gap-4 text-xs text-text-secondary">
              <a
                className="inline-flex items-center gap-1.5 hover:text-accent-primary transition-colors"
                href="https://x.com/priyanshh32"
                rel="noreferrer"
                target="_blank"
              >
                <Twitter aria-hidden="true" size={13} />
                @priyanshh32
              </a>
              <a
                className="inline-flex items-center gap-1.5 hover:text-accent-primary transition-colors"
                href="https://www.linkedin.com/in/priyansh32/"
                rel="noreferrer"
                target="_blank"
              >
                <Linkedin aria-hidden="true" size={13} />
                LinkedIn
              </a>
            </div>
          </div>

          <div className="flex items-center gap-6 text-sm font-semibold text-text-secondary">
            <a className="hover:text-accent-primary transition-colors" href="/library">
              Get Started
            </a>
            <a className="hover:text-accent-primary transition-colors" href="/login">
              Sign In
            </a>
            <a className="hover:text-accent-primary transition-colors" href="/privacy">
              Privacy
            </a>
            <a className="hover:text-accent-primary transition-colors" href="/terms">
              Terms
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
