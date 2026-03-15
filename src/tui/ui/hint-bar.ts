import { TextRenderable, TextNodeRenderable } from "@opentui/core";
import { theme } from "./theme";

export interface Hint {
  key: string;
  action: string;
}

export function buildHints(text: TextRenderable, hints: Hint[]): void {
  text.clear();
  text.add(TextNodeRenderable.fromString(" ", {}));
  for (let i = 0; i < hints.length; i++) {
    const h = hints[i];
    text.add(TextNodeRenderable.fromString(`[${h.key}]`, { fg: theme.blue }));
    text.add(TextNodeRenderable.fromString(` ${h.action}`, { fg: theme.textMuted }));
    if (i < hints.length - 1) {
      text.add(TextNodeRenderable.fromString("  ", {}));
    }
  }
}
