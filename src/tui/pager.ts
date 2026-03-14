import type { ReviewState } from "../state/review-state";
import type { Status, Thread } from "../protocol/types";
import {
  ScrollBoxRenderable,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";

const STATUS_ICONS: Record<Status, string> = {
  open: "\u{1F4AC}",
  pending: "\u{1F535}",
  resolved: "\u2714",
  outdated: "\u26A0",
};

const MAX_HINT_LENGTH = 40;

function padLineNum(n: number): string {
  const s = String(n);
  if (s.length >= 4) return s;
  return " ".repeat(4 - s.length) + s;
}

function threadHint(thread: Thread): string {
  if (thread.messages.length === 0) return "";
  const last = thread.messages[thread.messages.length - 1];
  const text = last.text.replace(/\n/g, " ");
  if (text.length <= MAX_HINT_LENGTH) return text;
  return text.slice(0, MAX_HINT_LENGTH - 1) + "\u2026";
}

/**
 * Build the pager content string from ReviewState.
 * Each line: lineNum (4-char padded) + "  " + line content + optional status indicator + thread hint
 * The cursor line is prefixed with ">" instead of the leading space.
 */
export function buildPagerContent(state: ReviewState): string {
  const lines: string[] = [];

  for (let i = 0; i < state.specLines.length; i++) {
    const lineNum = i + 1;
    const thread = state.threadAtLine(lineNum);
    const isCursor = lineNum === state.cursorLine;

    const prefix = isCursor ? ">" : " ";
    let line = `${prefix}${padLineNum(lineNum)}  ${state.specLines[i]}`;

    if (thread) {
      const icon = STATUS_ICONS[thread.status];
      const hint = threadHint(thread);
      line += `  ${icon} ${hint}`;
    }

    lines.push(line);
  }

  return lines.join("\n");
}

export interface PagerComponents {
  scrollBox: ScrollBoxRenderable;
  textNode: TextRenderable;
}

/**
 * Create the pager ScrollBox + Text renderable pair.
 */
export function createPager(renderer: CliRenderer): PagerComponents {
  const textNode = new TextRenderable(renderer, {
    content: "",
    width: "100%",
    wrapMode: "none",
  });

  const scrollBox = new ScrollBoxRenderable(renderer, {
    width: "100%",
    flexGrow: 1,
    flexShrink: 1,
    scrollY: true,
    scrollX: false,
  });

  scrollBox.add(textNode);

  return { scrollBox, textNode };
}
