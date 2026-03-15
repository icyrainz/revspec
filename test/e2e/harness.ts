import { spawn, type IPty } from "bun-pty";
import { resolve } from "path";

const CLI = resolve(import.meta.dir, "../../bin/revspec.ts");

// Strip ANSI escape sequences
function stripAnsi(str: string): string {
  return str
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")  // CSI sequences
    .replace(/\x1b\][^\x07]*\x07/g, "")       // OSC sequences
    .replace(/\x1b[()][0-9A-Z]/g, "")         // Character set
    .replace(/\x1b[>=<]/g, "")                 // Mode changes
    .replace(/\x1b\[\?[0-9;]*[hl]/g, "")      // Private mode set/reset
    .replace(/\r/g, "");                        // Carriage returns
}

export interface TuiHarness {
  sendKeys: (keys: string) => void;
  wait: (ms?: number) => Promise<void>;
  capture: () => string;
  quit: () => Promise<void>;
}

export async function createHarness(specFile: string, opts?: { cols?: number; rows?: number }): Promise<TuiHarness> {
  const cols = opts?.cols ?? 80;
  const rows = opts?.rows ?? 24;

  const specPath = resolve(specFile);

  let buffer = "";

  const pty = spawn("bun", ["run", CLI, specPath], {
    name: "xterm-256color",
    cols,
    rows,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      NO_COLOR: undefined,
      FORCE_COLOR: undefined,
    },
  });

  pty.onData((data: string) => {
    buffer += data;
  });

  function sendKeys(keys: string): void {
    pty.write(keys);
  }

  function wait(ms = 300): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function capture(): string {
    const raw = buffer;
    const clean = stripAnsi(raw);
    // The alternate screen content is the last screen of output
    // Split by lines and take the last `rows` lines
    const lines = clean.split("\n");
    const screen = lines.slice(Math.max(0, lines.length - rows), lines.length);
    return screen.join("\n").trimEnd();
  }

  async function quit(): Promise<void> {
    sendKeys("\x1b"); // Esc first to clear any state
    await wait(100);
    sendKeys("q");
    await wait(500);
    try {
      pty.kill();
    } catch {}
  }

  // Wait for initial render
  await wait(800);

  return { sendKeys, wait, capture, quit };
}
