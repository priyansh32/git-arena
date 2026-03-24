import { FileText } from "lucide-react";

const LAST_UPDATED = "March 21, 2026";

export function TermsPage() {
  return (
    <main className="min-h-screen bg-bg-base text-text-primary">
      <section className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-10 border-b border-border-subtle pb-6">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-border-strong bg-bg-surface px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
            <FileText aria-hidden="true" size={13} />
            Terms of Service
          </p>
          <h1 className="m-0 text-3xl font-bold tracking-tight sm:text-4xl">
            Terms of Service
          </h1>
          <p className="mt-3 text-sm text-text-secondary">Last updated: {LAST_UPDATED}</p>
          <p className="mt-2 text-xs text-text-secondary">
            Operated by Priyansh Patidar (
            <a
              className="font-mono text-text-primary hover:text-accent-primary transition-colors"
              href="https://x.com/priyanshh32"
              rel="noreferrer"
              target="_blank"
            >
              @priyanshh32
            </a>
            )
          </p>
        </header>

        {/* Preamble */}
        <div className="mb-10 rounded-lg border border-border-subtle bg-bg-surface px-6 py-5">
          <p className="m-0 leading-relaxed text-text-readable">
            git-arena is an independent project operated by a single developer. These terms govern
            your use of the platform and are written to be read, not to obscure what you are
            agreeing to.
          </p>
        </div>

        <div className="space-y-10 text-text-readable">

          {/* 1 */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-text-primary">1. Service description</h2>
            <p className="m-0 leading-relaxed">
              git-arena provides isolated, containerised Git practice environments and
              scenario-based evaluations for educational use. Each challenge session runs in a
              real Linux container with a real Git repository. An automated evaluator assesses
              the outcome of your work, not the specific commands used to reach it.
            </p>
            <p className="mt-4 m-0 leading-relaxed">
              git-arena is not a course, a certification programme, or a managed learning service.
              It is a practice tool.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-text-primary">2. Acceptable use</h2>
            <p className="m-0 leading-relaxed">
              You may use git-arena for personal learning, team training, and educational
              purposes. You may not attempt to escape the container sandbox, generate sessions
              in an automated or scripted manner, reproduce scenario content for redistribution,
              or use the platform for any unlawful purpose.
            </p>
            <p className="mt-4 m-0 leading-relaxed">
              If you discover a security vulnerability, please report it to{" "}
              <a className="text-accent-primary hover:underline" href="mailto:patidarpriyansh936@gmail.com">
                patidarpriyansh936@gmail.com
              </a>{" "}
              before public disclosure. Responsible reports will be acknowledged and credited.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-text-primary">3. Your account</h2>
            <p className="m-0 leading-relaxed">
              Authentication is handled through Sign in with Google. git-arena does not receive
              or store your Google password. You are responsible for maintaining the security of
              your Google account and for activity that occurs through your git-arena account. 
              Accounts may not be shared or used to run automated sessions.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-text-primary">4. Availability</h2>
            <p className="m-0 leading-relaxed">
              git-arena is operated on a best-effort basis by a single developer. Planned
              maintenance will be communicated where possible. No uptime guarantee is made.
            </p>
            <p className="mt-4 m-0 leading-relaxed">
              Challenge sessions are ephemeral. Container state is not preserved after a session
              ends. Do not rely on a session workspace for storing data you intend to keep.
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-text-primary">
              5. Intellectual property
            </h2>
            <p className="m-0 leading-relaxed">
              All platform code, scenario content, evaluator logic, and branding are the
              property of git-arena. You may reference and discuss them freely but may not
              reproduce or redistribute the scenario library without permission.
            </p>
            <p className="mt-4 m-0 leading-relaxed">
              You retain ownership of your account data. You may request a copy or deletion of
              your data at any time by contacting{" "}
              <a className="text-accent-primary hover:underline" href="mailto:patidarpriyansh936@gmail.com">
                patidarpriyansh936@gmail.com
              </a>
              .
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-text-primary">
              6. Limitation of liability
            </h2>
            <p className="m-0 leading-relaxed">
              git-arena is provided as-is and without warranty of any kind, including warranties
              of availability, accuracy, or fitness for a particular purpose. git-arena is not
              liable for any indirect, incidental, or consequential damages arising from your
              use of the platform.
            </p>
            <p className="mt-4 m-0 leading-relaxed">
              In practical terms: if a session crashes, a score is lost, or the platform is
              temporarily unavailable, git-arena cannot offer compensation. Issues will be
              investigated and corrected where possible.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-text-primary">
              7. Changes to these terms
            </h2>
            <p className="m-0 leading-relaxed">
              These terms may be updated from time to time. Material changes will be reflected
              in the date at the top of this page. Continued use of git-arena following an update
              constitutes acceptance of the revised terms.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-text-primary">8. Contact</h2>
            <p className="m-0 leading-relaxed">
              Questions about these terms should be directed to{" "}
              <a className="text-accent-primary hover:underline" href="mailto:patidarpriyansh936@gmail.com">
                patidarpriyansh936@gmail.com
              </a>
              .
            </p>
          </section>

        </div>
      </section>
    </main>
  );
}
