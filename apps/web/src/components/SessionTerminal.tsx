import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

interface SessionTerminalProps {
  wsUrl: string;
  wsToken: string;
}

function buildSocketUrl(path: string, token: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const search = new URLSearchParams({ token });

  return `${protocol}//${host}${normalizedPath}?${search.toString()}`;
}

export function SessionTerminal({ wsUrl, wsToken }: SessionTerminalProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const [connectionState, setConnectionState] = useState<
    "connecting" | "connected" | "closed" | "error"
  >("connecting");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      scrollback: 2000,
      fontFamily: `"IBM Plex Mono", "SFMono-Regular", monospace`,
      fontSize: 13,
      theme: {
        background: "#0f1713",
        foreground: "#c8f2db",
        cursor: "#7af2b5",
        selectionBackground: "rgba(95, 209, 145, 0.35)"
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
      setConnectionState("connected");
      terminal.writeln("\r\nWorkspace connected.");
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
      setConnectionState("error");
      terminal.writeln("\r\nConnection error.");
    };

    socket.onclose = (event) => {
      setConnectionState("closed");
      if (!event.wasClean) {
        terminal.writeln(`\r\nConnection closed (${event.code}).`);
      }
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
  }, [wsToken, wsUrl]);

  return (
    <div
      className="terminal-shell"
      onClick={() => {
        terminalRef.current?.focus();
      }}
    >
      <div className="terminal-status">
        <span>State: {connectionState}</span>
        <span>Type commands and press Enter.</span>
      </div>
      <div className="terminal-canvas" ref={mountRef} />
    </div>
  );
}
