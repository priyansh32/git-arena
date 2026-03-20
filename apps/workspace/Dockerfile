FROM alpine:3.19

# Policy requests git 2.43.0, but Alpine 3.19 ships 2.43.7-r0.
ARG GIT_VERSION=2.43.7-r0
ARG TTYD_VERSION=1.7.4-r0

RUN apk add --no-cache \
    git=${GIT_VERSION} \
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
    ttyd=${TTYD_VERSION} \
  && pip3 install --no-cache-dir --break-system-packages pygit2

RUN find / -xdev \( -perm /4000 -o -perm /2000 \) -exec chmod u-s,g-s {} \; 2>/dev/null || true

RUN rm -f /usr/bin/sudo /bin/su /usr/bin/su

RUN addgroup -g 1000 gituser && \
    adduser -D -u 1000 -G gituser -s /bin/bash gituser

RUN mkdir -p /workspace /repos /tmp && \
    chown gituser:gituser /workspace /repos && \
    chmod 755 /workspace /repos && \
    chmod 1777 /tmp

RUN chmod 555 /usr /bin /sbin /etc

COPY bashrc /home/gituser/.bashrc
COPY gitarena_eval.py /usr/local/lib/python3.11/gitarena_eval.py

RUN chown gituser:gituser /home/gituser/.bashrc && \
    chmod 644 /home/gituser/.bashrc && \
    chmod 644 /usr/local/lib/python3.11/gitarena_eval.py && \
    git config --system core.hooksPath /dev/null && \
    git config --system safe.directory /workspace

ENV HOME=/home/gituser \
    SHELL=/bin/bash \
    TERM=xterm-256color \
    GIT_AUTHOR_NAME="Git Arena" \
    GIT_AUTHOR_EMAIL="user@gitarena.dev" \
    GIT_COMMITTER_NAME="Git Arena" \
    GIT_COMMITTER_EMAIL="user@gitarena.dev" \
    LANG=en_US.UTF-8

USER gituser
WORKDIR /workspace

CMD ["ttyd", "-p", "7681", "-i", "127.0.0.1", "--writable", "bash"]
