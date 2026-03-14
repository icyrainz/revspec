import {
  BoxRenderable,
  InputRenderable,
  TextRenderable,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core";

export interface SearchOptions {
  renderer: CliRenderer;
  specLines: string[];
  cursorLine: number;
  onResult: (lineNumber: number) => void;
  onCancel: () => void;
}

export interface SearchOverlay {
  container: BoxRenderable;
  cleanup: () => void;
}

/**
 * Create a search overlay at the top of the screen.
 * On Enter: search forward from cursorLine, wrapping around.
 * On Escape: cancel.
 */
export function createSearch(opts: SearchOptions): SearchOverlay {
  const { renderer, specLines, cursorLine, onResult, onCancel } = opts;

  // Container bar at top
  const container = new BoxRenderable(renderer, {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    zIndex: 100,
    backgroundColor: "#313244",
    flexDirection: "row",
    alignItems: "center",
  });

  // Search label
  const label = new TextRenderable(renderer, {
    content: " / ",
    width: 3,
    height: 1,
    fg: "#f9e2af",
    bg: "#313244",
    wrapMode: "none",
  });

  // Search input
  const input = new InputRenderable(renderer, {
    width: "100%",
    flexGrow: 1,
    backgroundColor: "#313244",
    textColor: "#cdd6f4",
    focusedBackgroundColor: "#45475a",
    focusedTextColor: "#cdd6f4",
    placeholder: "Search...",
    placeholderColor: "#6c7086",
  });

  container.add(label);
  container.add(input);

  // Focus the input
  renderer.focusRenderable(input);

  // Key handler
  const keyHandler = (key: KeyEvent) => {
    if (key.name === "escape") {
      key.preventDefault();
      key.stopPropagation();
      onCancel();
      return;
    }
    if (key.name === "return") {
      key.preventDefault();
      key.stopPropagation();
      const query = input.value.trim().toLowerCase();
      if (query.length === 0) {
        onCancel();
        return;
      }

      // Search forward from cursor, wrapping around
      const total = specLines.length;
      for (let offset = 1; offset <= total; offset++) {
        const i = (cursorLine - 1 + offset) % total;
        if (specLines[i].toLowerCase().includes(query)) {
          onResult(i + 1); // 1-based line number
          return;
        }
      }

      // No match found — cancel (could flash a message, but keep simple)
      onCancel();
      return;
    }
  };

  renderer.keyInput.on("keypress", keyHandler);

  function cleanup(): void {
    renderer.keyInput.off("keypress", keyHandler);
    input.destroy();
  }

  return { container, cleanup };
}
