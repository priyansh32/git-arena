# GitArena — Workspace Permissions & Container Security Policy

**Document type:** Security + Product Policy
**Scope:** Challenge container runtime environment
**Audience:** Platform engineers, security reviewers, scenario authors

---

## 1. Design Philosophy

The challenge container exists to give users a **real, unrestricted Git experience** within a **strictly bounded execution environment**. These two goals are in tension. The policy resolves that tension with a single guiding rule:

> **Users own the workspace. They do not own the host, the network, or any resource outside `/workspace`.**

A user should never feel like they are working inside a sandbox. They should feel like they are working inside a real Linux shell with a real Git repo. The constraints are enforced at the infrastructure layer — invisible to the user unless they deliberately probe for them.

---

## 2. What Users Are Allowed to Do

### 2.1 Git Operations — Full Freedom

Users have unrestricted access to all Git commands and operations within the workspace. There are no blocked Git subcommands. The platform is designed to present real, messy Git situations, and users must be free to approach them in any way they choose.

**Permitted Git operations include but are not limited to:**

```
git add / git commit / git commit --amend
git branch / git checkout / git switch
git merge / git rebase / git rebase -i
git reset (--soft, --mixed, --hard)
git revert
git cherry-pick
git stash / git stash pop / git stash drop
git log / git reflog / git log --graph --all
git diff / git show / git blame
git tag / git tag -a / git tag -d
git remote / git fetch / git pull / git push
git bisect start / git bisect good / git bisect bad
git worktree
git submodule (read-only in most scenarios)
git config (user-scoped only — see §3)
git clean -fd
git restore / git restore --staged
git shortlog / git describe / git rev-parse
```

**Rationale:** The evaluation engine grades outcomes, not methods. A user who recovers a detached HEAD via `git reflog` + `git checkout -b` and a user who does it via `git branch new-branch <sha>` should both pass. Restricting commands would undermine the platform's core value — teaching real-world Git fluency.

### 2.2 Filesystem Operations — Within `/workspace`

Users may freely read, write, create, rename, and delete files and directories within `/workspace`. This is the designated working directory for all scenarios.

**Permitted:**

- Create, edit, and delete files using any available text tool (`vi`, `nano`, `cat`, `echo`, `tee`, `sed`, `awk`, `touch`, `cp`, `mv`, `rm`, `mkdir`, `rmdir`)
- Read any file in `/workspace` including hidden files (`.git/`, `.gitignore`, `.gitconfig` if present in repo)
- Create scripts and make them executable with `chmod +x`
- Create subdirectories and nested directory structures
- Use pipes and redirects (`>`, `>>`, `|`, `<`)

**Boundaries:**

- Write operations outside `/workspace` are blocked by filesystem permissions (see §3.2)
- `/tmp` is available for scratch work but is not evaluated and is not persisted

### 2.3 Shell and Process Operations

Users have access to a fully functional bash shell. Common Unix utilities are available.

**Permitted shell operations:**

- Run shell scripts created within `/workspace`
- Use all standard Unix utilities: `grep`, `find`, `sort`, `uniq`, `xargs`, `cut`, `tr`, `wc`, `head`, `tail`, `cat`, `less`, `diff`, `patch`
- Use `env` and `printenv` to inspect environment variables (non-sensitive only — see §3.4)
- Use `ps`, `ls`, `pwd`, `whoami`, `id`, `hostname` for orientation
- Use `echo`, `printf`, `read` for scripting
- Chain commands with `&&`, `||`, `;`
- Use job control: `&` (background), `Ctrl+C`, `Ctrl+Z` (suspended jobs will be reaped by session timeout)
- Use `history` to review prior commands

**Available tools (pre-installed in base image):**

| Tool | Purpose |
|---|---|
| `git` (pinned version) | All Git operations |
| `bash` | Primary shell |
| `vim` / `nano` | Text editing |
| `python3` | Scripting (useful for some scenarios) |
| `grep`, `sed`, `awk` | Text processing |
| `curl` | Available but network-blocked — returns connection errors |
| `ssh` | Available but network-blocked |
| `jq` | JSON processing |
| `diff`, `patch` | File comparison |
| `make` | Build tool (useful in some scenarios) |

### 2.4 Reading Git Internals

Users are explicitly encouraged to explore `.git/` internals as part of learning. Reading `.git/` is fully permitted.

**Permitted:**

```bash
cat .git/HEAD
cat .git/COMMIT_EDITMSG
cat .git/config
ls .git/refs/
cat .git/refs/heads/main
find .git/objects/ -type f
git cat-file -t <sha>
git cat-file -p <sha>
git ls-tree HEAD
git ls-files
git verify-pack -v .git/objects/pack/*.idx
```

**Rationale:** Many advanced Git scenarios (reflog recovery, object inspection, bisect debugging) require understanding of `.git/` internals. Blocking these would make certain challenges unsolvable.

### 2.5 Simulated Remote Repositories

Each scenario that involves a remote configures one or more bare repos within the container at a path like `/repos/origin.git` or `/repos/upstream.git`. Users interact with these as they would real remotes.

**Permitted:**

```bash
git remote -v                      # see configured remotes
git fetch origin
git pull origin main
git push origin main
git push origin --force-with-lease
git push origin --tags
git remote add upstream file:///repos/upstream.git
git ls-remote origin
```

Users may push to and pull from these bare repos freely. The bare repos are part of the scenario state and are included in the workspace snapshot at submission time. Evaluators can inspect the state of bare repos as part of grading.

---

## 3. What Users Are Not Allowed to Do

### 3.1 Network Access

**All outbound network access is blocked.**

The container's network namespace has no external egress. DNS resolution for external hostnames fails. TCP connections to addresses outside the container's loopback and internal repo paths are refused at the kernel level via network namespace isolation — not by a firewall rule that can be bypassed with elevated privileges.

**Blocked:**

```bash
curl https://example.com           # connection refused / timeout
git clone https://github.com/...   # connection refused
git push git@github.com:...        # connection refused
ssh user@remotehost                # connection refused
wget http://...                    # connection refused
nc -zv 8.8.8.8 80                  # connection refused
ping 1.1.1.1                       # network unreachable
```

**Why this matters:**
- Prevents exfiltration of scenario content or evaluation logic
- Prevents users from fetching tooling or exploits from the internet
- Prevents side-channel attacks on the orchestrator or API from inside the container
- Prevents scenarios from being "solved" by fetching answers externally

**User-facing behavior:** `curl` and other network tools are present in the image because their absence would itself be a signal. They return connection errors, exactly as they would if the user had no internet. This is intentional — it feels like a network issue, not a capability restriction.

### 3.2 Filesystem Access Outside `/workspace` and `/tmp`

Users run as a non-root user (`gituser`, UID 1000). The container filesystem is structured so that:

- `/workspace` — owned by `gituser`, full read/write
- `/tmp` — world-writable, not evaluated, not snapshotted
- `/repos/` — owned by `gituser`, read/write (contains scenario bare repos)
- `/home/gituser/` — readable, minimal `.bashrc` and `.gitconfig`
- Everything else — owned by `root`, readable only, not writable

**Blocked write targets:**

```bash
echo "x" > /etc/passwd            # permission denied
echo "x" > /usr/local/bin/git     # permission denied
rm -rf /bin                        # permission denied
chmod 777 /usr/bin/sudo            # permission denied
touch /root/file                   # permission denied
```

**Readable but not writable system paths** (informational access is acceptable):

```bash
cat /etc/os-release                # ok — not sensitive
cat /proc/version                  # ok
ls /usr/bin/                       # ok
```

### 3.3 Privilege Escalation

Users cannot gain elevated privileges by any means available inside the container.

**Blocked:**

- `sudo` is not installed
- `su` is not installed
- `setuid` binaries are removed from the image during build (`find / -perm /4000 -exec chmod u-s {} \;`)
- `newuidmap` / `newgidmap` are not available
- `pkexec` is not installed
- The user cannot install packages (`apk`, `apt`, `yum` require root)
- `/etc/sudoers` does not exist

**Kernel-level enforcement (gVisor):** Even if a user finds a path to a root shell inside the container, gVisor's `runsc` runtime intercepts all syscalls. Syscalls that are not required for the workload profile (e.g. `ptrace`, `mount`, `unshare`, `clone` with `CLONE_NEWUSER`) are blocked at the gVisor layer before they reach the host kernel. Container escape via kernel exploits is not feasible against gVisor.

**Dropped Linux capabilities:**

The container is started with all capabilities dropped except the minimum required:

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  allowPrivilegeEscalation: false
  capabilities:
    drop:
      - ALL
  seccompProfile:
    type: RuntimeDefault
```

### 3.4 Access to Sensitive Environment Variables

The container environment is deliberately sparse. No secrets, tokens, or infrastructure addresses are injected into the container environment.

**Not present in container environment:**

- API keys or Firebase credentials
- Orchestrator internal addresses
- Database connection strings
- S3 bucket names or credentials
- The session ID or user ID
- The evaluator script contents
- Any hint content

**Present in container environment (non-sensitive):**

```
HOME=/home/gituser
SHELL=/bin/bash
TERM=xterm-256color
GIT_AUTHOR_NAME=Git Arena
GIT_AUTHOR_EMAIL=user@gitarena.dev
GIT_COMMITTER_NAME=Git Arena
GIT_COMMITTER_EMAIL=user@gitarena.dev
LANG=en_US.UTF-8
```

**Rationale:** A user inspecting `env` or `/proc/self/environ` should find nothing useful for attacking the platform. The git identity variables are set so that commits authored during the session have a consistent, non-identifying identity for evaluation purposes.

### 3.5 Modifying the Evaluator or Seed Artifacts

The evaluator script is never present inside the challenge container. It lives in S3, is fetched by the orchestrator at submission time, and runs inside a separate evaluator container that mounts a snapshot of the workspace. There is nothing for the user to tamper with.

**The user cannot:**
- Read the evaluator script (it is never in the challenge container)
- Modify files after submission (snapshot is taken server-side immediately on submit)
- Influence what is included in the snapshot (the entire `/workspace` and `/repos/` directories are archived)
- Access the evaluator container's filesystem or process space

### 3.6 Inter-Container Communication

The challenge container is isolated in its own network namespace. It cannot communicate with:

- Other users' challenge containers
- The session orchestrator
- The API backend
- Any internal platform service

The only inbound connection to the container is the WebSocket proxy from the API layer (proxied ttyd). There is no other open port.

### 3.7 Persistence Across Sessions

Containers are ephemeral. When a session ends (submission, timeout, or abandonment):

1. The container process is terminated
2. The container filesystem is destroyed
3. No data from the session persists in any container-accessible location

Users cannot:
- Resume a terminated session
- Carry state from one session into a new session
- Access another user's workspace

The only persistence is the evaluation result stored in PostgreSQL, and the workspace snapshot in S3 (retained 24 hours for admin dispute resolution, then deleted).

---

## 4. Restricted but Monitored Operations

These operations are permitted but logged for audit and anomaly detection:

| Operation | Why monitored |
|---|---|
| `find / -type f` | Filesystem enumeration — normal curiosity, but worth tracking |
| `cat /proc/self/status` | Process inspection |
| `git config --global` | Attempting to modify global git config |
| Large numbers of processes spawned | Potential fork bomb or resource abuse |
| Writing files >50MB to `/workspace` | Potential disk exhaustion |
| Repeated failed permission-denied errors | Potential privilege escalation probing |

These do not result in session termination automatically. The session monitor (part of the orchestrator) observes resource metrics and terminates sessions that exceed thresholds (see §5.3).

---

## 5. Implementation Plan

### 5.1 Base Container Image Build

**Goal:** Produce a minimal, hardened Alpine Linux image with Git and required tooling, no setuid binaries, and correct filesystem permissions.

**Dockerfile:**

```dockerfile
FROM alpine:3.19

ARG GIT_VERSION=2.43.0

# Install required packages
RUN apk add --no-cache \
    git=${GIT_VERSION}-r0 \
    bash \
    vim \
    nano \
    python3 \
    py3-pip \
    jq \
    curl \
    openssh-client \
    diffutils \
    patch \
    make \
    grep \
    sed \
    gawk \
    findutils \
    coreutils \
    util-linux \
  && pip3 install --no-cache-dir pygit2 --break-system-packages

# Remove all setuid and setgid binaries
RUN find / -xdev \( -perm /4000 -o -perm /2000 \) -exec chmod u-s,g-s {} \; 2>/dev/null || true

# Remove sudo and su if present
RUN rm -f /usr/bin/sudo /bin/su /usr/bin/su

# Create non-root user
RUN addgroup -g 1000 gituser && \
    adduser -D -u 1000 -G gituser -s /bin/bash gituser

# Create directory structure
RUN mkdir -p /workspace /repos /tmp && \
    chown gituser:gituser /workspace /repos && \
    chmod 755 /workspace /repos && \
    chmod 1777 /tmp

# Set restrictive permissions on system directories
RUN chmod 555 /usr /bin /sbin /etc

# Copy gitarena evaluation helper library
COPY gitarena_eval.py /usr/local/lib/python3.11/gitarena_eval.py

# Configure git defaults
RUN git config --system core.hooksPath /dev/null && \
    git config --system safe.directory /workspace

# Set up minimal .bashrc for gituser
COPY bashrc /home/gituser/.bashrc
RUN chown gituser:gituser /home/gituser/.bashrc

# ttyd for WebSocket terminal
RUN apk add --no-cache ttyd || \
    (wget -qO /usr/local/bin/ttyd https://github.com/tsl0922/ttyd/releases/download/1.7.3/ttyd.$(uname -m) && \
     chmod +x /usr/local/bin/ttyd)

USER gituser
WORKDIR /workspace

# ttyd binds to localhost:7681, exposes bash shell
CMD ["ttyd", "-p", "7681", "-i", "127.0.0.1", "--writable", "bash"]
```

**Image hardening checklist (automated in CI):**

```bash
# Verify no setuid binaries
find / -xdev -perm /4000 2>/dev/null | grep -v "^$" && exit 1

# Verify gituser cannot write outside /workspace and /repos
docker run --rm gitarena-base:latest sh -c 'touch /etc/test 2>&1 | grep -q "Permission denied"'

# Verify sudo is absent
docker run --rm gitarena-base:latest sh -c '! which sudo'

# Verify git version is pinned
docker run --rm gitarena-base:latest git --version | grep "2.43.0"

# Verify network tools exist but return errors (network will be blocked at runtime)
docker run --rm --network none gitarena-base:latest \
  curl https://example.com 2>&1 | grep -E "Could not resolve|Connection refused|Network unreachable"
```

**Image tagging strategy:**

```
gitarena-base:2.43.0-alpine3.19-v1    # pinned: git version + OS version + image iteration
gitarena-base:latest                   # always points to current stable
```

Scenarios reference the full pinned tag. `latest` is only used in development.

### 5.2 Kubernetes Pod Security Configuration

Each challenge container is deployed as a Kubernetes Pod with the following security configuration:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: session-${SESSION_ID}
  namespace: gitarena-sessions
  labels:
    app: challenge-session
    session-id: ${SESSION_ID}
    user-id: ${USER_ID}
    scenario-id: ${SCENARIO_ID}
spec:
  runtimeClassName: gvisor          # gVisor (runsc) runtime

  automountServiceAccountToken: false   # no K8s API access

  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000
    seccompProfile:
      type: RuntimeDefault

  # No service account — container cannot call K8s API
  serviceAccountName: ""

  containers:
    - name: challenge
      image: gitarena-base:2.43.0-alpine3.19-v1
      imagePullPolicy: IfNotPresent

      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: false    # /workspace must be writable
        capabilities:
          drop:
            - ALL

      resources:
        requests:
          memory: "128Mi"
          cpu: "250m"
        limits:
          memory: "256Mi"
          cpu: "500m"
          ephemeral-storage: "1Gi"

      env:
        - name: HOME
          value: /home/gituser
        - name: SHELL
          value: /bin/bash
        - name: TERM
          value: xterm-256color
        - name: GIT_AUTHOR_NAME
          value: "Git Arena"
        - name: GIT_AUTHOR_EMAIL
          value: "user@gitarena.dev"
        - name: GIT_COMMITTER_NAME
          value: "Git Arena"
        - name: GIT_COMMITTER_EMAIL
          value: "user@gitarena.dev"
        # NOTE: No secrets, no tokens, no internal addresses

      ports:
        - containerPort: 7681
          protocol: TCP

      livenessProbe:
        tcpSocket:
          port: 7681
        initialDelaySeconds: 5
        periodSeconds: 10

  # Network policy enforced separately (see §5.4)
  # Pod has no external egress

  restartPolicy: Never              # containers are not restarted on failure
  terminationGracePeriodSeconds: 10
```

### 5.3 Resource Limits and Session Monitor

The orchestrator runs a session monitor goroutine that polls active sessions every 30 seconds.

**Termination triggers:**

| Condition | Action |
|---|---|
| Session age > `time_limit_seconds` (scenario-configured) | Trigger auto-submit, then terminate |
| No WebSocket activity for > 20 minutes | Terminate (idle timeout) |
| Container CPU usage > 480m for > 60 seconds | Warn, then terminate at 120s |
| Container memory usage > 240MB | Terminate immediately |
| Ephemeral storage > 900MB | Terminate immediately |
| Container health check fails 3× | Terminate |
| Process count in container > 50 | Log anomaly, terminate at > 100 |

**Implementation (orchestrator pseudocode):**

```go
func (m *SessionMonitor) Poll(ctx context.Context) {
    sessions := m.store.GetActiveSessions()
    for _, s := range sessions {
        metrics := m.k8s.GetPodMetrics(s.PodName)

        if time.Since(s.StartedAt) > s.TimeLimit {
            m.AutoSubmitAndTerminate(s, "time_limit_exceeded")
            continue
        }
        if time.Since(s.LastActivity) > 20*time.Minute {
            m.Terminate(s, "idle_timeout")
            continue
        }
        if metrics.Memory > 240*MB {
            m.Terminate(s, "memory_limit")
            continue
        }
        if metrics.EphemeralStorage > 900*MB {
            m.Terminate(s, "disk_limit")
            continue
        }
        if metrics.ProcessCount > 100 {
            m.Terminate(s, "process_limit")
            continue
        }
    }
}
```

**User-facing communication:** When a session is terminated by the monitor for non-time reasons, the browser terminal displays a message explaining why (e.g. "Session terminated: memory limit exceeded") before the WebSocket connection is closed.

### 5.4 Network Policy

A Kubernetes `NetworkPolicy` blocks all egress from session pods except to the WebSocket proxy (the API layer).

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: session-isolation
  namespace: gitarena-sessions
spec:
  podSelector:
    matchLabels:
      app: challenge-session
  policyTypes:
    - Ingress
    - Egress

  ingress:
    # Only the API backend's WebSocket proxy may connect to challenge pods
    - from:
        - namespaceSelector:
            matchLabels:
              name: gitarena-api
          podSelector:
            matchLabels:
              app: api-backend
      ports:
        - protocol: TCP
          port: 7681

  egress:
    # No egress permitted — not even DNS
    # (Local bare repos in /repos/ use file:// — no network needed)
    []
```

**Note:** The empty `egress: []` block blocks all outbound traffic including DNS. This is intentional. Scenarios that require DNS are not supported in v1. The only "remote" communication happens via `file://` protocol to bare repos within the same container.

### 5.5 gVisor Configuration

gVisor (`runsc`) is deployed as a `RuntimeClass` in the cluster:

```yaml
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: gvisor
handler: runsc
```

**gVisor syscall policy:** gVisor's default syscall filter blocks syscalls that are not required for standard userspace workloads. The additional restrictions relevant to this use case:

| Blocked syscall | Why relevant |
|---|---|
| `ptrace` | Cannot attach to other processes |
| `mount` | Cannot remount filesystems |
| `unshare` with `CLONE_NEWUSER` | Cannot create new user namespaces |
| `kexec_load` | Cannot replace the kernel |
| `bpf` | Cannot load eBPF programs |
| `perf_event_open` | Cannot use perf for side-channel attacks |
| `syslog` | Cannot read kernel logs |

**Performance note:** gVisor introduces 10–20% overhead on syscall-heavy workloads. For Git operations (which involve significant filesystem syscalls), this means commands that take 50ms on bare metal may take 55–60ms under gVisor. This is acceptable and imperceptible to users. The security benefit justifies the cost.

### 5.6 Seed Script Execution and Validation

In v1, scenario scripts are source-controlled files in the repository (`apps/api/scenarios/<scenario-id>/seed.sh` and `eval.sh`).
There is no in-product admin authoring endpoint in scope for v1.

Before scripts are merged/deployed, they must pass automated validation.

**Validation pipeline (runs in CI and local pre-release checks):**

```bash
#!/bin/bash
# validate_seed.sh — runs in a throwaway container

set -e
SEED_SCRIPT=$1
EVAL_SCRIPT=$2
CONTAINER_IMAGE="gitarena-base:latest"

# Step 1: bash syntax check
bash -n "$SEED_SCRIPT" || { echo "FAIL: bash syntax error"; exit 1; }

# Step 2: run in throwaway container, check it completes within 10s
timeout 10 docker run --rm \
  --network none \
  --memory 128m \
  --cpus 0.5 \
  -v "$SEED_SCRIPT:/tmp/seed.sh:ro" \
  "$CONTAINER_IMAGE" \
  bash /tmp/seed.sh \
  || { echo "FAIL: seed script failed or timed out"; exit 1; }

# Step 3: verify /workspace is a valid git repo after seed
docker run --rm \
  --network none \
  --memory 128m \
  --cpus 0.5 \
  -v "$SEED_SCRIPT:/tmp/seed.sh:ro" \
  -v "$EVAL_SCRIPT:/tmp/eval.sh:ro" \
  "$CONTAINER_IMAGE" \
  bash -c "bash /tmp/seed.sh && git -C /workspace status && bash /tmp/eval.sh > /tmp/eval.out && grep -q '^PASS:' /tmp/eval.out && grep -q '^SCORE:' /tmp/eval.out" \
  || { echo "FAIL: /workspace is not a valid git repo after seeding"; exit 1; }

echo "OK: seed script validated"
```

**Status workflow note (v1):**

- Scenario statuses (`draft`, `testing`, `published`) remain in database metadata.
- Status changes are managed through developer/ops workflows (DB/tooling) until admin authoring APIs are introduced.

**Seed script author guidelines (enforced by linter):**

```
REQUIRED:
  - Must initialize a git repo in /workspace
  - Must not require network access
  - Must complete in under 10 seconds
  - Must be idempotent (safe to run twice)

PROHIBITED:
  - curl, wget, git clone from remote URLs
  - Writing outside /workspace or /repos/
  - Installing packages (apk add, pip install, etc.)
  - Referencing hardcoded SHAs that may become invalid
```

### 5.7 Snapshot and Evaluator Separation

At submission time, the orchestrator takes a workspace snapshot and launches an evaluator container. The separation is enforced by design:

```
Challenge container (running)
  └── /workspace/  ← user's work
  └── /repos/      ← simulated remotes

On submit:
  Orchestrator runs: kubectl exec <pod> -- tar czf - /workspace /repos > snapshot.tar.gz
  Snapshot uploaded to S3: sessions/<session_id>/snapshot.tar.gz

Evaluator container (separate pod, separate namespace):
  └── Mounts snapshot from S3 (read-only, extracted to /workspace-ro/)
  └── Downloads eval.sh from S3
  └── Runs: bash eval.sh  (or python3 eval.py)
  └── eval.sh operates on /workspace-ro/ — cannot modify
  └── Emits PASS/FAIL lines to stdout
  └── Orchestrator captures stdout, parses result, stores in DB
  └── Evaluator container is terminated
```

**Evaluator container security config:**

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1001           # different UID from challenge container
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true   # evaluator root is fully read-only
  capabilities:
    drop:
      - ALL
resources:
  limits:
    memory: "128Mi"
    cpu: "500m"
activeDeadlineSeconds: 60   # pod is force-killed after 60s
```

### 5.8 Audit Logging

The orchestrator emits a structured audit event for every security-relevant action:

```json
{
  "timestamp": "ISO8601",
  "session_id": "uuid",
  "user_id": "uuid",
  "scenario_id": "uuid",
  "event_type": "session.terminated",
  "reason": "memory_limit_exceeded",
  "container_id": "string",
  "metrics_at_termination": {
    "memory_mb": 248,
    "cpu_millicores": 312,
    "ephemeral_storage_mb": 312,
    "process_count": 14,
    "elapsed_seconds": 847
  }
}
```

Event types:
- `session.created`
- `session.seed_started` / `session.seed_completed` / `session.seed_failed`
- `session.ws_connected` / `session.ws_disconnected` / `session.ws_reconnected`
- `session.submitted`
- `session.auto_submitted` (timer expired)
- `session.terminated`
- `session.anomaly_detected` (resource threshold warning)
- `evaluation.started` / `evaluation.completed` / `evaluation.timed_out`

---

## 6. Summary Table

| Capability | Allowed | Notes |
|---|---|---|
| All git subcommands | ✅ | No restrictions |
| Read/write `/workspace` | ✅ | Full ownership |
| Read/write `/repos/` | ✅ | Scenario bare repos |
| Read/write `/tmp` | ✅ | Not evaluated, not snapshotted |
| Run shell scripts | ✅ | If created in `/workspace` |
| View `.git/` internals | ✅ | Core to Git learning |
| Use vim, nano, python3 | ✅ | Pre-installed |
| `git config` (local scope) | ✅ | `--local` only |
| `git config` (global scope) | ⚠️ | Permitted but logged; affects only container |
| Outbound network | ❌ | Blocked at network namespace level |
| Write outside `/workspace` | ❌ | Permission denied (UID/GID) |
| `sudo` / `su` | ❌ | Not installed |
| Install packages | ❌ | Requires root |
| Setuid binaries | ❌ | Stripped from image |
| Access evaluator script | ❌ | Never present in container |
| Access other users' sessions | ❌ | Network isolation |
| Persist state across sessions | ❌ | Ephemeral container |
| Access K8s API | ❌ | No service account token mounted |
| Dangerous syscalls (ptrace, mount…) | ❌ | Blocked by gVisor |
| Fork bomb / process flood | ❌ | Process count limit + session termination |
| Disk exhaustion | ❌ | Ephemeral storage limit + session termination |
| Memory exhaustion | ❌ | Memory limit + session termination |

---

## 7. Open Issues and Future Work

**Issue 1: Git hooks**
Git hooks (`.git/hooks/`) are user-writable and execute automatically during git operations. A user could place a malicious `post-commit` hook. In v1, hooks are disabled globally via `git config --system core.hooksPath /dev/null`. This is enforced in the image build. Scenario authors who want to test hook-related scenarios must explicitly re-enable hooks in the seed script.

**Issue 2: Python scripting within workspace**
`python3` is available and unrestricted. A user could write a Python script that attempts to read sensitive paths or spawn many processes. Read access to non-sensitive paths is acceptable (there is nothing sensitive to read). Process flooding is mitigated by the process count limit.

**Issue 3: `/proc` filesystem**
`/proc` is mounted read-only inside the gVisor sandbox. Users can read `/proc/self/` (their own process info) but cannot see other processes or write to `/proc` entries. This is enforced by gVisor's procfs emulation layer.

**Issue 4: Symlink attacks**
A user could create a symlink in `/workspace` pointing to a path outside `/workspace`. Since the user does not have write permission to those paths, the symlink is harmless for write operations. For read operations, they could read any world-readable file on the container filesystem — which contains no secrets (see §3.4). This is an accepted risk.

**Future: Per-scenario capability profiles**
Advanced scenarios (e.g. teaching about git hooks, worktrees with multiple remote addresses) may require slightly different capability profiles. The image and pod spec should support a `capability_overrides` field in scenario metadata, reviewed and approved by an admin before publish.

**Future: Read-only filesystem for non-workspace paths**
Setting `readOnlyRootFilesystem: true` at the pod level is desirable but currently blocked by ttyd's need to write to `/tmp` at startup. Once ttyd is patched or replaced, enabling this would be a meaningful hardening improvement.
