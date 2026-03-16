import { BoxRenderable, TextRenderable, TextNodeRenderable, TextAttributes, type CliRenderer } from "@opentui/core";
import type { ReviewState } from "../state/review-state";
import { basename } from "path";
import { theme } from "./ui/theme";
import { buildHints } from "./ui/hint-bar";
import { PAGER_HINTS } from "./ui/keymap";

export interface TopBarComponents {
  box: BoxRenderable;
  text: TextRenderable;
}

export interface BottomBarComponents {
  box: BoxRenderable;
  text: TextRenderable;
}

/**
 * Build the top bar with styled TextNodes.
 */
export function buildTopBar(
  bar: TopBarComponents,
  specFile: string,
  state: ReviewState,
  unreadCount?: number,
  specChanged?: boolean,
): void {
  const t = bar.text;
  t.clear();
  const name = basename(specFile);
  const { open, pending } = state.activeThreadCount();

  // Filename — bold
  t.add(TextNodeRenderable.fromString(` ${name}`, { fg: theme.text, attributes: TextAttributes.BOLD }));

  t.add(TextNodeRenderable.fromString("  \u00b7  ", { fg: theme.textDim }));

  // Thread summary
  if (open > 0 || pending > 0) {
    const parts: string[] = [];
    if (open > 0) parts.push(`${open} open`);
    if (pending > 0) parts.push(`${pending} pending`);
    t.add(TextNodeRenderable.fromString(parts.join(", "), { fg: theme.yellow }));
  } else {
    t.add(TextNodeRenderable.fromString("No active threads", { fg: theme.textMuted }));
  }

  // Unread replies
  if (unreadCount && unreadCount > 0) {
    t.add(TextNodeRenderable.fromString("  \u00b7  ", { fg: theme.textDim }));
    t.add(TextNodeRenderable.fromString(
      `${unreadCount} new repl${unreadCount === 1 ? "y" : "ies"}`,
      { fg: theme.green, attributes: TextAttributes.BOLD }
    ));
  }

  // Spec changed warning
  if (specChanged) {
    t.add(TextNodeRenderable.fromString("  \u00b7  ", { fg: theme.textDim }));
    t.add(TextNodeRenderable.fromString("!! Spec changed externally", { fg: theme.red, attributes: TextAttributes.BOLD }));
  }

  // Cursor position + scroll percentage
  const posLabel = state.cursorLine <= 1 ? "Top"
    : state.cursorLine >= state.lineCount ? "Bot"
    : `${Math.round(((state.cursorLine - 1) / (state.lineCount - 1)) * 100)}%`;
  t.add(TextNodeRenderable.fromString("  \u00b7  ", { fg: theme.textDim }));
  t.add(TextNodeRenderable.fromString(`L${state.cursorLine}/${state.lineCount} ${posLabel}`, { fg: theme.textMuted }));
}

export type MessageIcon = "warn" | "success" | "info";

const ICON_MAP: Record<MessageIcon, { symbol: string; fg: string }> = {
  warn:    { symbol: "!", fg: theme.yellow! },
  success: { symbol: "*", fg: theme.green! },
  info:    { symbol: "-", fg: theme.blue! },
};

/**
 * Set a transient message on the bottom bar.
 * With icon: renders as " ⚠ │ message text"
 * Without icon: renders as " message text"
 */
export function setBottomBarMessage(
  bar: BottomBarComponents,
  message: string,
  iconOrFg?: MessageIcon | string,
): void {
  const t = bar.text;
  t.clear();

  // Detect if it's an icon type or a raw fg color
  const icon = iconOrFg && iconOrFg in ICON_MAP ? ICON_MAP[iconOrFg as MessageIcon] : null;
  const fg = icon ? icon.fg : (iconOrFg as string | undefined) ?? theme.text;

  if (icon) {
    t.add(TextNodeRenderable.fromString(` ${icon.symbol} `, { fg: icon.fg }));
    t.add(TextNodeRenderable.fromString(message, { fg: fg! }));
  } else {
    t.add(TextNodeRenderable.fromString(` ${message}`, { fg: fg! }));
  }
}

/**
 * Build the bottom bar with styled TextNodes.
 */
export function buildBottomBar(bar: BottomBarComponents, commandBuffer: string | null, hasThread?: boolean): void {
  const t = bar.text;
  t.clear();
  if (commandBuffer !== null) {
    t.add(TextNodeRenderable.fromString(` :${commandBuffer}`, { fg: theme.text }));
    return;
  }
  const hints = [
    PAGER_HINTS.navigate,
    PAGER_HINTS.comment,
  ];
  if (hasThread) {
    hints.push(PAGER_HINTS.resolve);
  }
  hints.push(PAGER_HINTS.submit);
  hints.push(PAGER_HINTS.approve);
  hints.push(PAGER_HINTS.help);
  buildHints(t, hints);
}

/**
 * Create the top status bar (BoxRenderable with backgroundColor for full-width fill).
 */
export function createTopBar(renderer: CliRenderer): TopBarComponents {
  const box = new BoxRenderable(renderer, {
    width: "100%",
    height: 1,
    backgroundColor: theme.backgroundPanel,
  });

  const text = new TextRenderable(renderer, {
    content: "",
    width: "100%",
    fg: theme.text,
    wrapMode: "none",
    truncate: true,
  });

  box.add(text);
  return { box, text };
}

/**
 * Create the bottom status bar.
 */
export function createBottomBar(renderer: CliRenderer): BottomBarComponents {
  const box = new BoxRenderable(renderer, {
    width: "100%",
    height: 1,
    flexShrink: 0,
    backgroundColor: theme.backgroundPanel,
  });

  const text = new TextRenderable(renderer, {
    content: "",
    width: "100%",
    fg: theme.text,
    wrapMode: "none",
    truncate: true,
  });

  box.add(text);
  return { box, text };
}
