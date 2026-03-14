import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core";
import type { Thread } from "../protocol/types";

export interface ThreadExpandOptions {
  renderer: CliRenderer;
  thread: Thread;
  onResolve: () => void;
  onContinue: () => void;
  onClose: () => void;
}

export interface ThreadExpandOverlay {
  container: BoxRenderable;
  cleanup: () => void;
}

/**
 * Create a thread expand overlay showing full thread messages.
 * Each message shows author icon + text.
 * Actions: [r]esolve [c]ontinue [q]uit
 */
export function createThreadExpand(opts: ThreadExpandOptions): ThreadExpandOverlay {
  const { renderer, thread, onResolve, onContinue, onClose } = opts;

  const statusLabel = thread.status.toUpperCase();
  const title = ` Thread #${thread.id} (line ${thread.line}) [${statusLabel}] `;

  // Overlay container
  const container = new BoxRenderable(renderer, {
    position: "absolute",
    top: "10%",
    left: "10%",
    width: "80%",
    height: "70%",
    zIndex: 100,
    backgroundColor: "#1e1e2e",
    border: true,
    borderStyle: "single",
    borderColor: "#a6e3a1",
    title,
    flexDirection: "column",
    padding: 1,
  });

  // Scrollable message area
  const scrollBox = new ScrollBoxRenderable(renderer, {
    width: "100%",
    flexGrow: 1,
    flexShrink: 1,
    scrollY: true,
    scrollX: false,
  });

  // Build message content
  const lines: string[] = [];
  for (const msg of thread.messages) {
    const icon = msg.author === "human" ? "\u{1F464}" : "\u{1F916}";
    const authorLabel = msg.author === "human" ? "You" : "AI";
    lines.push(`${icon} ${authorLabel}:`);
    // Indent message text
    for (const textLine of msg.text.split("\n")) {
      lines.push(`  ${textLine}`);
    }
    lines.push(""); // blank separator
  }

  const messageText = new TextRenderable(renderer, {
    content: lines.join("\n"),
    width: "100%",
    fg: "#cdd6f4",
    wrapMode: "word",
  });

  scrollBox.add(messageText);

  // Action hint bar
  const hint = new TextRenderable(renderer, {
    content: " [r] resolve  [c] continue (reply)  [q] quit",
    width: "100%",
    height: 1,
    fg: "#6c7086",
    bg: "#313244",
    wrapMode: "none",
    truncate: true,
  });

  container.add(scrollBox);
  container.add(hint);

  // Key handler
  const keyHandler = (key: KeyEvent) => {
    if (key.name === "q" || key.name === "escape") {
      key.preventDefault();
      key.stopPropagation();
      onClose();
      return;
    }
    if (key.name === "r") {
      key.preventDefault();
      key.stopPropagation();
      onResolve();
      return;
    }
    if (key.name === "c") {
      key.preventDefault();
      key.stopPropagation();
      onContinue();
      return;
    }
  };

  renderer.keyInput.on("keypress", keyHandler);

  function cleanup(): void {
    renderer.keyInput.off("keypress", keyHandler);
  }

  return { container, cleanup };
}
