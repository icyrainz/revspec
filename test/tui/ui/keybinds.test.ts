import { describe, expect, it } from "bun:test";
import { createKeybindRegistry } from "../../../src/tui/ui/keybinds";

function makeKey(name: string, opts: { ctrl?: boolean; shift?: boolean; sequence?: string } = {}): any {
  return { name, ctrl: opts.ctrl ?? false, shift: opts.shift ?? false, sequence: opts.sequence ?? name };
}

describe("createKeybindRegistry", () => {
  it("matches single keys", () => {
    const reg = createKeybindRegistry([
      { key: "j", action: "down" },
      { key: "k", action: "up" },
    ]);
    expect(reg.match(makeKey("j"))).toBe("down");
    expect(reg.match(makeKey("k"))).toBe("up");
    expect(reg.match(makeKey("x"))).toBeNull();
    reg.destroy();
  });

  it("matches ctrl keys", () => {
    const reg = createKeybindRegistry([
      { key: "C-d", action: "half-page-down" },
    ]);
    expect(reg.match(makeKey("d", { ctrl: true }))).toBe("half-page-down");
    expect(reg.match(makeKey("d"))).toBeNull();
    reg.destroy();
  });

  it("matches shift keys", () => {
    const reg = createKeybindRegistry([
      { key: "G", action: "goto-bottom" },
      { key: "R", action: "resolve-all" },
    ]);
    expect(reg.match(makeKey("g", { shift: true }))).toBe("goto-bottom");
    expect(reg.match(makeKey("r", { shift: true }))).toBe("resolve-all");
    reg.destroy();
  });

  it("matches two-key sequences", () => {
    const reg = createKeybindRegistry([
      { key: "gg", action: "goto-top" },
      { key: "dd", action: "delete" },
    ]);
    expect(reg.match(makeKey("g"))).toBeNull();
    expect(reg.pending()).toBe("g...");
    expect(reg.match(makeKey("g"))).toBe("goto-top");
    expect(reg.pending()).toBeNull();
    reg.destroy();
  });

  it("clears sequence on invalid second key", () => {
    const reg = createKeybindRegistry([
      { key: "gg", action: "goto-top" },
      { key: "j", action: "down" },
    ]);
    expect(reg.match(makeKey("g"))).toBeNull();
    expect(reg.match(makeKey("x"))).toBeNull();
    expect(reg.match(makeKey("j"))).toBe("down");
    reg.destroy();
  });

  it("handles bracket sequences", () => {
    const reg = createKeybindRegistry([
      { key: "]t", action: "next-thread" },
      { key: "[t", action: "prev-thread" },
    ]);
    expect(reg.match(makeKey("]", { sequence: "]" }))).toBeNull();
    expect(reg.match(makeKey("t"))).toBe("next-thread");
    reg.destroy();
  });
});
