import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

export type TerminalConnectionState = "connecting" | "connected" | "closed" | "error";

interface SessionTerminalProps {
  wsUrl: string;
  wsToken: string;
  onStateChange?: (state: TerminalConnectionState) => void;
}

function buildSocketUrl(path: string, token: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const wsBaseUrl = import.meta.env.VITE_WS_BASE_URL as string | undefined;

  if (/^wss?:\/\//i.test(path)) {
    const url = new URL(path);
    url.searchParams.set("token", token);
    return url.toString();
  }

  const base =
    wsBaseUrl && /^wss?:\/\//i.test(wsBaseUrl)
      ? wsBaseUrl
      : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;

  const url = new URL(normalizedPath, base.endsWith("/") ? base : `${base}/`);
  url.searchParams.set("token", token);
  return url.toString();
}

function readCssVar(name: string, fallback: string): string {
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value.length > 0 ? value : fallback;
}

function writeWorkspaceIntro(terminal: Terminal): void {
  terminal.writeln("Workspace connected.");
  terminal.writeln("[git-arena] Git workspace is ready.");
  terminal.writeln("[git-arena] Primary repo: /workspace");
  terminal.writeln("[git-arena] Local remotes and fixtures: /repos");
  terminal.writeln("[git-arena] When done, use Submit Solution in the side panel.");
  terminal.writeln("");
}

export function SessionTerminal({ wsUrl, wsToken, onStateChange }: SessionTerminalProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const [connectionState, setConnectionState] = useState<TerminalConnectionState>("connecting");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const updateConnectionState = (next: TerminalConnectionState) => {
      setConnectionState(next);
      onStateChange?.(next);
    };

    updateConnectionState("connecting");

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      scrollback: 2000,
      fontFamily: readCssVar("--font-mono", "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"),
      fontSize: 13,
      theme: {
        background: "#000000",
        foreground: readCssVar("--text-primary", "#f4f4f5"),
        cursor: readCssVar("--accent-primary", "#06b6d4"),
        selectionBackground: "rgba(6, 182, 212, 0.3)",
        black: "#000000",
        red: "#ef4444",
        green: "#10b981",
        yellow: "#f59e0b",
        blue: "#06b6d4",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#f4f4f5",
        brightBlack: "#27272a",
        brightRed: "#f87171",
        brightGreen: "#34d399",
        brightYellow: "#fbbf24",
        brightBlue: "#22d3ee",
        brightMagenta: "#c084fc",
        brightCyan: "#67e8f9",
        brightWhite: "#fafafa"
      }
    });
    const fitAddon = new FitAddon();
    terminalRef.current = terminal;
    terminal.loadAddon(fitAddon);
    terminal.open(mount);
    fitAddon.fit();
    terminal.focus();
    terminal.writeln("Connecting to workspace...");

    const socket = new WebSocket(buildSocketUrl(wsUrl, wsToken));
    socket.binaryType = "arraybuffer";

    const onResize = () => {
      fitAddon.fit();
    };
    window.addEventListener("resize", onResize);

    const inputDisposable = terminal.onData((input) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(input);
      }
    });

    socket.onopen = () => {
      updateConnectionState("connected");
      writeWorkspaceIntro(terminal);
      terminal.focus();
    };

    socket.onmessage = (event) => {
      if (typeof event.data === "string") {
        terminal.write(event.data);
        return;
      }

      if (event.data instanceof ArrayBuffer) {
        terminal.write(new TextDecoder().decode(event.data));
      }
    };

    socket.onerror = () => {
      updateConnectionState("error");
      terminal.writeln("\r\nConnection error.");
    };

    socket.onclose = (event) => {
      updateConnectionState("closed");
      const reason = event.reason?.trim();
      terminal.writeln(
        `\r\nConnection closed (${event.code}${reason ? `: ${reason}` : ""}).`
      );
    };

    return () => {
      inputDisposable.dispose();
      window.removeEventListener("resize", onResize);
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
      terminalRef.current = null;
      terminal.dispose();
    };
  }, [onStateChange, wsToken, wsUrl]);

  return (
    <div
      className="session-terminal-shell"
      data-state={connectionState}
      onClick={() => {
        terminalRef.current?.focus();
      }}
    >
      <div className="session-terminal-canvas" ref={mountRef} />
    </div>
  );
}
