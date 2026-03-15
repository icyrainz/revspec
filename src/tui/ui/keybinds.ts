import type { KeyEvent } from "@opentui/core";

export interface KeyBinding {
  key: string;
  action: string;
}

interface SequenceState {
  first: string;
  timer: ReturnType<typeof setTimeout>;
}

export interface KeybindRegistry {
  match: (key: KeyEvent) => string | null;
  pending: () => string | null;
  destroy: () => void;
}

export function createKeybindRegistry(bindings: KeyBinding[], timeout = 500): KeybindRegistry {
  let sequence: SequenceState | null = null;

  const singleBindings = new Map<string, string>();
  const sequenceBindings = new Map<string, string>();

  for (const b of bindings) {
    if (b.key.length === 2 && !b.key.startsWith("C-")) {
      sequenceBindings.set(b.key, b.action);
    } else {
      singleBindings.set(b.key, b.action);
    }
  }

  const sequenceStarters = new Set<string>();
  for (const key of sequenceBindings.keys()) {
    sequenceStarters.add(key[0]);
  }

  function keyToString(key: KeyEvent): string {
    if (key.ctrl && key.name) return `C-${key.name}`;
    if (key.shift && key.name) return key.name.toUpperCase();
    return key.sequence || key.name || "";
  }

  function match(key: KeyEvent): string | null {
    const keyStr = keyToString(key);

    if (sequence) {
      const seq = sequence.first + keyStr;
      clearTimeout(sequence.timer);
      sequence = null;

      const action = sequenceBindings.get(seq);
      if (action) return action;
    }

    // Check ctrl variants first
    if (key.ctrl && key.name) {
      const action = singleBindings.get(`C-${key.name}`);
      if (action) return action;
    }

    // Check if this starts a sequence (but not if ctrl is held)
    if (!key.ctrl && sequenceStarters.has(keyStr)) {
      sequence = {
        first: keyStr,
        timer: setTimeout(() => { sequence = null; }, timeout),
      };
      return null;
    }

    // Shift variants
    if (key.shift && key.name) {
      const upper = key.name.toUpperCase();
      const action = singleBindings.get(upper);
      if (action) return action;
    }

    return singleBindings.get(keyStr) ?? null;
  }

  function pendingStr(): string | null {
    if (!sequence) return null;
    return `${sequence.first}...`;
  }

  function destroy(): void {
    if (sequence) {
      clearTimeout(sequence.timer);
      sequence = null;
    }
  }

  return { match, pending: pendingStr, destroy };
}
