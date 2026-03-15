import {
  BoxRenderable,
  TextRenderable,
  TextareaRenderable,
  ScrollBoxRenderable,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core";
import type { Thread, Message } from "../protocol/types";
import { theme } from "./theme";

export interface CommentInputOptions {
  renderer: CliRenderer;
  line: number;
  existingThread: Thread | null;
  onSubmit: (text: string) => void;
  onResolve: () => void;
  onCancel: () => void;
}

export interface CommentInputOverlay {
  container: BoxRenderable;
  cleanup: () => void;
  addMessage: (msg: Message) => void;
  threadId: string | null;
}


export function createCommentInput(opts: CommentInputOptions): CommentInputOverlay {
  const { renderer, line, existingThread, onSubmit, onResolve, onCancel } = opts;
  // Always use thread view — even for new comments (empty history, just the input)
  const thread = existingThread ?? { id: "", line, status: "open" as const, messages: [] };
  return createThreadView(renderer, line, thread, onSubmit, onResolve, onCancel);
}

// --- Unified thread view: works for both new comments and existing threads ---
function createThreadView(
  renderer: CliRenderer,
  line: number,
  thread: Thread,
  onSubmit: (text: string) => void,
  onResolve: () => void,
  onCancel: () => void,
): CommentInputOverlay {
  const container = new BoxRenderable(renderer, {
    position: "absolute",
    top: "5%",
    left: "10%",
    width: "80%",
    height: "85%",
    zIndex: 100,
    backgroundColor: theme.base,
    border: true,
    borderStyle: "single",
    borderColor: theme.borderComment,
    title: thread.id ? ` Thread #${thread.id} (line ${line}) ` : ` New comment on line ${line} `,
    flexDirection: "column",
    padding: 1,
  });

  // --- Top: scrollable conversation history ---
  const scrollBox = new ScrollBoxRenderable(renderer, {
    width: "100%",
    flexGrow: 1,
    flexShrink: 1,
    scrollY: true,
    scrollX: false,
  });

  function renderMessage(msg: Message): BoxRenderable {
    const isReviewer = msg.author === "reviewer";
    const borderColor = isReviewer ? theme.blue : theme.green;
    const label = isReviewer ? "You" : "AI";
    const tsStr = msg.ts ? new Date(msg.ts).toISOString().replace("T", " ").slice(0, 19) : "";

    const msgBox = new BoxRenderable(renderer, {
      width: "100%",
      border: ["left"],
      borderColor,
      paddingLeft: 1,
      marginBottom: 1,
      flexDirection: "column",
    });

    // Header: author + timestamp
    const header = new TextRenderable(renderer, {
      content: tsStr ? `${label}  ${tsStr}` : label,
      width: "100%",
      height: 1,
      fg: theme.subtext,
      wrapMode: "none",
    });
    msgBox.add(header);

    // Body: message text
    const body = new TextRenderable(renderer, {
      content: msg.text,
      width: "100%",
      fg: theme.text,
      wrapMode: "word",
    });
    msgBox.add(body);

    return msgBox;
  }

  for (const msg of thread.messages) {
    scrollBox.add(renderMessage(msg));
  }
  container.add(scrollBox);

  // --- Separator ---
  const sep = new TextRenderable(renderer, {
    content: "\u2500".repeat(40),
    width: "100%",
    height: 1,
    fg: theme.surface1,
    wrapMode: "none",
  });
  container.add(sep);

  // --- Bottom: textarea (visible in both modes, focused only in insert) ---
  const textarea = new TextareaRenderable(renderer, {
    width: "100%",
    height: 4,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: theme.surface1,
    textColor: theme.overlay,
    focusedBackgroundColor: theme.surface0,
    focusedTextColor: theme.text,
    wrapMode: "word",
    placeholder: "Press c to reply...",
    placeholderColor: theme.overlay,
    initialValue: "",
  });
  container.add(textarea);

  // --- Hint bar (changes with mode) ---
  const hintNormal = " [c] reply  [r] resolve  [Esc] close";
  const hintInsert = " [Tab] send  [Esc] back";

  const hint = new TextRenderable(renderer, {
    content: hintInsert,
    width: "100%",
    height: 1,
    fg: theme.hintFg,
    bg: theme.hintBg,
    wrapMode: "none",
    truncate: true,
  });
  container.add(hint);

  // --- State ---
  let mode: "normal" | "insert" = "insert";

  function enterInsert(): void {
    mode = "insert";
    textarea.focus();
    hint.content = hintInsert;
    renderer.requestRender();
  }

  function enterNormal(): void {
    mode = "normal";
    textarea.blur();
    hint.content = hintNormal;
    renderer.requestRender();
  }

  // Start in insert mode, scroll conversation to bottom
  setTimeout(() => {
    textarea.focus();
    scrollBox.scrollTo(scrollBox.scrollHeight);
    renderer.requestRender();
    setTimeout(() => {
      scrollBox.scrollTo(scrollBox.scrollHeight);
      renderer.requestRender();
    }, 50);
  }, 0);

  function appendToConversation(msg: Message): void {
    scrollBox.add(renderMessage(msg));
    renderer.requestRender();
    setTimeout(() => {
      scrollBox.scrollTo(scrollBox.scrollHeight);
      renderer.requestRender();
      setTimeout(() => {
        scrollBox.scrollTo(scrollBox.scrollHeight);
        renderer.requestRender();
      }, 50);
    }, 50);
  }

  const keyHandler = (key: KeyEvent) => {
    if (mode === "insert") {
      // --- INSERT MODE ---
      if (key.name === "escape") {
        key.preventDefault(); key.stopPropagation();
        enterNormal();
        return;
      }
      if (key.name === "tab") {
        key.preventDefault(); key.stopPropagation();
        const text = textarea.plainText.trim();
        if (text.length === 0) return;
        onSubmit(text);
        appendToConversation({ author: "reviewer", text, ts: Date.now() });
        textarea.selectAll();
        textarea.deleteChar();
        enterNormal();
        return;
      }
      // All other keys: let textarea handle them (don't preventDefault)
      return;
    }

    // --- NORMAL MODE (textarea blurred, all keys are ours) ---
    key.preventDefault(); key.stopPropagation();

    switch (key.name) {
      case "escape":
      case "q":
        onCancel();
        return;

      case "c":
        enterInsert();
        return;

      case "r":
        onResolve();
        return;

      case "j":
      case "down":
        scrollBox.scrollBy({ x: 0, y: 1 });
        renderer.requestRender();
        return;

      case "k":
      case "up":
        scrollBox.scrollBy({ x: 0, y: -1 });
        renderer.requestRender();
        return;

      case "d":
        if (key.ctrl) {
          // Use same scrollBy as j/k, just more lines
          scrollBox.scrollBy({ x: 0, y: 5 });
          renderer.requestRender();
        }
        return;

      case "u":
        if (key.ctrl) {
          scrollBox.scrollBy({ x: 0, y: -5 });
          renderer.requestRender();
        }
        return;

      case "g":
        if (key.shift) {
          // G = go to bottom
          scrollBox.scrollTo(scrollBox.scrollHeight);
          renderer.requestRender();
        }
        // TODO: gg = go to top (needs double-tap tracking)
        return;
    }
  };

  renderer.keyInput.on("keypress", keyHandler);

  return {
    container,
    cleanup() { renderer.keyInput.off("keypress", keyHandler); textarea.destroy(); },
    threadId: thread.id,
    addMessage(msg: Message) { appendToConversation(msg); },
  };
}
