import { ShieldCheck } from "lucide-react";

const LAST_UPDATED = "March 21, 2026";

export function PrivacyPage() {
  return (
    <main className="min-h-screen bg-bg-base text-text-primary">
      <section className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-10 border-b border-border-subtle pb-6">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-border-strong bg-bg-surface px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
            <ShieldCheck aria-hidden="true" size={13} />
            Privacy Policy
          </p>
          <h1 className="m-0 text-3xl font-bold tracking-tight sm:text-4xl">Privacy Policy</h1>
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
            GitArena collects only the data required to operate the platform. It is not sold,
            shared with advertisers, or used for purposes beyond what is described below.
          </p>
        </div>

        <div className="space-y-10 text-text-readable">

          {/* 1 */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-text-primary">
              1. Data collected
            </h2>
            <p className="m-0 leading-relaxed">
              When you sign in with Google, GitArena receives your name, email address, and a
              unique identifier from Google. This information is used to create and identify your
              account. GitArena does not receive your Google password and has no access to your
              Google account beyond what you explicitly grant during sign-in.
            </p>
            <p className="mt-4 m-0 leading-relaxed">
              When you attempt a scenario, GitArena records the scenario identifier, your score,
              the individual assertion results, and the timestamp of the attempt. This data
              constitutes your progress history and is required for the platform to function.
            </p>
            <p className="mt-4 m-0 leading-relaxed">
              GitArena also collects session metadata: start and end times, session status, and
              termination reason where applicable. This is used for infrastructure monitoring
              and platform improvement.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-text-primary">
              2. Data not collected
            </h2>
            <p className="m-0 leading-relaxed">
              GitArena does not log terminal input. Commands typed, files edited, and shell
              history within a challenge session are not recorded or stored. The evaluator
              operates on the final state of your repository at submission time only.
            </p>
            <p className="mt-4 m-0 leading-relaxed">
              GitArena does not use advertising networks, third-party analytics scripts, or
              session recording tools. No data is sent to Facebook, Google Analytics, or similar
              services.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-text-primary">
              3. Workspace snapshots
            </h2>
            <p className="m-0 leading-relaxed">
              On submission, a snapshot of your repository state is taken and passed to the
              evaluator. This snapshot is stored in object storage for up to 24 hours and then
              permanently deleted. It is not used for any purpose other than evaluation.
            </p>
            <p className="mt-4 m-0 leading-relaxed">
              Do not enter real credentials, API keys, or personal secrets inside a challenge
              workspace. The scenarios do not require sensitive material of this kind.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-text-primary">
              4. Cookies and authentication
            </h2>
            <p className="m-0 leading-relaxed">
              Following sign-in, GitArena sets a single session cookie valid for up to 8 hours.
              The cookie is httpOnly and transmitted over HTTPS only. GitArena does not set
              tracking, preference, or third-party cookies.
            </p>
            <p className="mt-4 m-0 leading-relaxed">
              Clearing your browser cookies will end your session. Your account and progress
              data are not affected.
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-text-primary">
              5. Retention
            </h2>
            <p className="m-0 leading-relaxed">
              Account and attempt data are retained for the lifetime of your account. Workspace
              snapshots are deleted within 24 hours of submission. Server logs containing IP
              addresses and request metadata are rotated after 30 days.
            </p>
            <p className="mt-4 m-0 leading-relaxed">
              To request deletion of your account and associated data, contact{" "}
              <a className="text-accent-primary hover:underline" href="mailto:patidarpriyansh936@gmail.com">
                patidarpriyansh936@gmail.com
              </a>
              . Requests are processed within a reasonable timeframe and confirmed by reply.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-text-primary">
              6. Third-party processors
            </h2>
            <p className="m-0 leading-relaxed">
              GitArena uses Google Firebase for authentication and a cloud infrastructure
              provider for hosting and object storage. Data is processed on these platforms as
              a necessary part of operating the service. No data is shared with any other third
              party, and GitArena does not sell personal data.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="mb-3 text-xl font-semibold text-text-primary">7. Contact</h2>
            <p className="m-0 leading-relaxed">
              Privacy-related questions and data requests should be directed to{" "}
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
