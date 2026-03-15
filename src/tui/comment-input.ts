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
  /** Update the conversation display with a new message (e.g., AI reply arrived) */
  addMessage: (msg: Message) => void;
  /** The thread ID this overlay is showing (null for new comments) */
  threadId: string | null;
}

function formatMessage(msg: Message): string {
  const authorLabel = msg.author === "reviewer" ? "You" : " AI";
  const tsStr = msg.ts ? new Date(msg.ts).toISOString().replace("T", " ").slice(0, 19) : "";
  const tsDisplay = tsStr ? ` [${tsStr}]` : "";
  const lines: string[] = [];
  lines.push(`${authorLabel}${tsDisplay}:`);
  for (const textLine of msg.text.split("\n")) {
    lines.push(`  ${textLine}`);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Create a unified comment/thread overlay.
 *
 * New comment mode: focused text input, Tab submits and closes.
 *
 * Existing thread mode: two sections —
 *   Top: scrollable conversation history (j/k or PageUp/PageDown to scroll)
 *   Bottom: reply input (press c to focus, Tab to submit reply and unfocus, Esc to close)
 *
 * The popup stays open after submitting a reply. AI replies appear live via addMessage().
 */
export function createCommentInput(opts: CommentInputOptions): CommentInputOverlay {
  const { renderer, line, existingThread, onSubmit, onResolve, onCancel } = opts;

  const hasThread = existingThread && existingThread.messages.length > 0;

  // --- New comment mode: simple input ---
  if (!hasThread) {
    return createNewCommentOverlay(renderer, line, onSubmit, onCancel);
  }

  // --- Existing thread mode: history + reply ---
  return createThreadOverlay(renderer, line, existingThread!, onSubmit, onResolve, onCancel);
}

function createNewCommentOverlay(
  renderer: CliRenderer,
  line: number,
  onSubmit: (text: string) => void,
  onCancel: () => void,
): CommentInputOverlay {
  const container = new BoxRenderable(renderer, {
    position: "absolute",
    top: "30%",
    left: "10%",
    width: "80%",
    height: 10,
    zIndex: 100,
    backgroundColor: theme.base,
    border: true,
    borderStyle: "single",
    borderColor: theme.borderComment,
    title: ` New comment on line ${line} `,
    flexDirection: "column",
    padding: 1,
  });

  const textarea = new TextareaRenderable(renderer, {
    width: "100%",
    flexGrow: 1,
    backgroundColor: theme.surface0,
    textColor: theme.text,
    focusedBackgroundColor: theme.surface0,
    focusedTextColor: theme.text,
    wrapMode: "word",
    placeholder: "Type your comment...",
    placeholderColor: theme.overlay,
    initialValue: "",
  });

  const hint = new TextRenderable(renderer, {
    content: " [Tab] submit  [Esc] cancel",
    width: "100%",
    height: 1,
    fg: theme.hintFg,
    bg: theme.hintBg,
    wrapMode: "none",
    truncate: true,
  });

  container.add(textarea);
  container.add(hint);

  setTimeout(() => { textarea.focus(); renderer.requestRender(); }, 0);

  let submitted = false;
  const keyHandler = (key: KeyEvent) => {
    if (key.name === "escape") {
      key.preventDefault(); key.stopPropagation();
      onCancel();
      return;
    }
    if (key.name === "tab") {
      key.preventDefault(); key.stopPropagation();
      if (submitted) return;
      submitted = true;
      const text = textarea.plainText.trim();
      if (text.length > 0) onSubmit(text); else onCancel();
      return;
    }
  };

  renderer.keyInput.on("keypress", keyHandler);

  return {
    container,
    cleanup() { renderer.keyInput.off("keypress", keyHandler); textarea.destroy(); },
    addMessage() {},
    threadId: null,
  };
}

function createThreadOverlay(
  renderer: CliRenderer,
  line: number,
  thread: Thread,
  onSubmit: (text: string) => void,
  onResolve: () => void,
  onCancel: () => void,
): CommentInputOverlay {
  const label = `Thread #${thread.id} (line ${line}) [${thread.status.toUpperCase()}]`;

  const container = new BoxRenderable(renderer, {
    position: "absolute",
    top: "5%",
    left: "10%",
    width: "80%",
    height: "80%",
    zIndex: 100,
    backgroundColor: theme.base,
    border: true,
    borderStyle: "single",
    borderColor: theme.borderComment,
    title: ` ${label} `,
    flexDirection: "column",
    padding: 1,
  });

  // --- Scrollable conversation history ---
  const scrollBox = new ScrollBoxRenderable(renderer, {
    width: "100%",
    flexGrow: 1,
    flexShrink: 1,
    scrollY: true,
    scrollX: false,
  });

  let conversationContent = "";
  for (const msg of thread.messages) {
    conversationContent += formatMessage(msg);
  }

  const messageText = new TextRenderable(renderer, {
    content: conversationContent,
    width: "100%",
    fg: theme.text,
    wrapMode: "word",
  });

  scrollBox.add(messageText);
  container.add(scrollBox);

  // --- Reply input area (initially hidden/unfocused) ---
  const inputBox = new BoxRenderable(renderer, {
    width: "100%",
    height: 6,
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: "column",
  });

  const sep = new TextRenderable(renderer, {
    content: " Reply (press c to type):",
    width: "100%",
    height: 1,
    fg: theme.subtext,
    wrapMode: "none",
  });

  const textarea = new TextareaRenderable(renderer, {
    width: "100%",
    height: 4,
    backgroundColor: theme.surface1,
    textColor: theme.overlay,
    focusedBackgroundColor: theme.surface0,
    focusedTextColor: theme.text,
    wrapMode: "word",
    placeholder: "Press c to reply...",
    placeholderColor: theme.overlay,
    initialValue: "",
  });

  inputBox.add(sep);
  inputBox.add(textarea);
  container.add(inputBox);

  // --- Hint bar ---
  const hintBrowse = " [j/k] scroll  [c] reply  [r] resolve  [Esc] close";
  const hintEdit = " [Tab] send  [Esc] cancel edit";

  const hint = new TextRenderable(renderer, {
    content: hintBrowse,
    width: "100%",
    height: 1,
    fg: theme.hintFg,
    bg: theme.hintBg,
    wrapMode: "none",
    truncate: true,
  });

  container.add(hint);

  // Scroll to bottom
  setTimeout(() => {
    scrollBox.scrollTo(scrollBox.scrollHeight);
    renderer.requestRender();
  }, 0);

  // --- State ---
  let editing = false;

  function appendToConversation(msg: Message): void {
    conversationContent += formatMessage(msg);
    messageText.content = conversationContent;
    setTimeout(() => {
      scrollBox.scrollTo(scrollBox.scrollHeight);
      renderer.requestRender();
    }, 0);
  }

  function startEditing(): void {
    editing = true;
    textarea.focus();
    sep.content = " Reply:";
    hint.content = hintEdit;
    renderer.requestRender();
  }

  function stopEditing(): void {
    editing = false;
    textarea.blur();
    sep.content = " Reply (press c to type):";
    hint.content = hintBrowse;
    renderer.requestRender();
  }

  const keyHandler = (key: KeyEvent) => {
    if (editing) {
      // --- Editing mode ---
      if (key.name === "escape") {
        key.preventDefault(); key.stopPropagation();
        stopEditing();
        return;
      }
      if (key.name === "tab") {
        key.preventDefault(); key.stopPropagation();
        const text = textarea.plainText.trim();
        if (text.length > 0) {
          onSubmit(text);
          appendToConversation({ author: "reviewer", text, ts: Date.now() });
          // Clear textarea by setting new initial value
          textarea.selectAll();
          textarea.deleteChar();
        }
        stopEditing();
        return;
      }
      // Let textarea handle all other keys when editing
      return;
    }

    // --- Browse mode (not editing) ---
    if (key.name === "escape") {
      key.preventDefault(); key.stopPropagation();
      onCancel();
      return;
    }
    if (key.name === "c") {
      key.preventDefault(); key.stopPropagation();
      startEditing();
      return;
    }
    if (key.name === "r") {
      key.preventDefault(); key.stopPropagation();
      const wasResolved = thread.status === "resolved";
      onResolve();
      return;
    }
    // j/k scroll conversation
    if (key.name === "j" || key.name === "down") {
      key.preventDefault(); key.stopPropagation();
      scrollBox.scrollBy({ x: 0, y: 1 });
      renderer.requestRender();
      return;
    }
    if (key.name === "k" || key.name === "up") {
      key.preventDefault(); key.stopPropagation();
      scrollBox.scrollBy({ x: 0, y: -1 });
      renderer.requestRender();
      return;
    }
    // Page scroll
    if (key.name === "pagedown" || (key.ctrl && key.name === "d")) {
      key.preventDefault(); key.stopPropagation();
      const amount = Math.max(1, Math.floor(scrollBox.visibleHeight / 2));
      scrollBox.scrollBy({ x: 0, y: amount });
      renderer.requestRender();
      return;
    }
    if (key.name === "pageup" || (key.ctrl && key.name === "u")) {
      key.preventDefault(); key.stopPropagation();
      const amount = Math.max(1, Math.floor(scrollBox.visibleHeight / 2));
      scrollBox.scrollBy({ x: 0, y: -amount });
      renderer.requestRender();
      return;
    }
    // G go to bottom, gg go to top
    if (key.shift && key.name === "g") {
      key.preventDefault(); key.stopPropagation();
      scrollBox.scrollTo(scrollBox.scrollHeight);
      renderer.requestRender();
      return;
    }
  };

  renderer.keyInput.on("keypress", keyHandler);

  return {
    container,
    cleanup() {
      renderer.keyInput.off("keypress", keyHandler);
      textarea.destroy();
    },
    threadId: thread.id,
    addMessage(msg: Message) {
      appendToConversation(msg);
    },
  };
}
