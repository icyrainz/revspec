import type { ReviewState } from "../state/review-state";
import type { Thread } from "../protocol/types";
import {
  ScrollBoxRenderable,
  BoxRenderable,
  TextRenderable,
  MarkdownRenderable,
  SyntaxStyle,
  parseColor,
  type CliRenderer,
} from "@opentui/core";
import { theme, STATUS_ICONS } from "./theme";

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
 * Build the gutter content (line numbers + cursor + thread indicators).
 * This is plain text displayed in a narrow left column.
 */
export function buildGutterContent(state: ReviewState): string {
  const lines: string[] = [];

  for (let i = 0; i < state.specLines.length; i++) {
    const lineNum = i + 1;
    const thread = state.threadAtLine(lineNum);
    const isCursor = lineNum === state.cursorLine;

    const prefix = isCursor ? ">" : " ";
    let gutter = `${prefix}${padLineNum(lineNum)}`;

    if (thread) {
      const icon = STATUS_ICONS[thread.status];
      gutter += ` ${icon}`;
    } else {
      gutter += "   ";
    }

    lines.push(gutter);
  }

  return lines.join("\n");
}

/**
 * Build plain text pager content (for testing and fallback).
 */
export function buildPagerContent(state: ReviewState, searchQuery?: string | null): string {
  const lines: string[] = [];

  for (let i = 0; i < state.specLines.length; i++) {
    const lineNum = i + 1;
    const thread = state.threadAtLine(lineNum);
    const isCursor = lineNum === state.cursorLine;

    const prefix = isCursor ? ">" : " ";
    let specText = state.specLines[i];

    if (searchQuery) {
      const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      specText = specText.replace(regex, (match) => `>>${match}<<`);
    }

    let line = `${prefix}${padLineNum(lineNum)}  ${specText}`;

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
  gutterNode: TextRenderable;
  markdownNode: MarkdownRenderable;
}

const GUTTER_WIDTH = 10;

function createMarkdownStyle(): SyntaxStyle {
  return SyntaxStyle.fromStyles({
    default: { fg: parseColor(theme.text) },
    "markup.heading": { fg: parseColor(theme.blue), bold: true },
    "markup.heading.1": { fg: parseColor(theme.blue), bold: true },
    "markup.heading.2": { fg: parseColor(theme.blue), bold: true },
    "markup.heading.3": { fg: parseColor(theme.mauve), bold: true },
    "markup.heading.4": { fg: parseColor(theme.mauve) },
    "markup.heading.5": { fg: parseColor(theme.mauve) },
    "markup.heading.6": { fg: parseColor(theme.mauve) },
    "markup.bold": { fg: parseColor(theme.text), bold: true },
    "markup.strong": { fg: parseColor(theme.text), bold: true },
    "markup.italic": { fg: parseColor(theme.text), italic: true },
    "markup.link": { fg: parseColor(theme.blue) },
    "markup.link.url": { fg: parseColor(theme.blue) },
    "markup.list": { fg: parseColor(theme.yellow) },
    "markup.raw": { fg: parseColor(theme.green) },
    "markup.raw.inline": { fg: parseColor(theme.green) },
    "string": { fg: parseColor(theme.green) },
    "comment": { fg: parseColor(theme.overlay) },
    "punctuation.special": { fg: parseColor(theme.overlay) },
  });
}

/**
 * Create the pager with a gutter (line numbers + indicators) and markdown content.
 */
export function createPager(renderer: CliRenderer): PagerComponents {
  // Gutter — line numbers and thread indicators
  const gutterNode = new TextRenderable(renderer, {
    content: "",
    width: GUTTER_WIDTH,
    wrapMode: "none",
    fg: theme.overlay,
    bg: theme.base,
  });

  // Markdown content with syntax styling
  const markdownNode = new MarkdownRenderable(renderer, {
    content: "",
    width: "100%",
    flexGrow: 1,
    syntaxStyle: createMarkdownStyle(),
    conceal: true,
  });

  // Row container for side-by-side layout
  const row = new BoxRenderable(renderer, {
    width: "100%",
    flexDirection: "row",
    flexGrow: 1,
  });
  row.add(gutterNode);
  row.add(markdownNode);

  // Scrollable container
  const scrollBox = new ScrollBoxRenderable(renderer, {
    width: "100%",
    flexGrow: 1,
    flexShrink: 1,
    scrollY: true,
    scrollX: false,
    backgroundColor: theme.base,
  });

  scrollBox.add(row);

  return { scrollBox, gutterNode, markdownNode };
}
