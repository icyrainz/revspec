import { describe, it, expect } from "bun:test";
import { findNextMatch } from "../../../src/tui/search";

const lines = [
  "# Heading One",       // line 1
  "Some plain text",     // line 2
  "## Another Heading",  // line 3
  "foo bar baz",         // line 4
  "FOO BAR BAZ",         // line 5
  "the end",             // line 6
];

describe("findNextMatch", () => {
  it("finds a match forward from cursor", () => {
    const result = findNextMatch(lines, 1, "foo");
    expect(result).toEqual({ lineNumber: 4, query: "foo" });
  });

  it("wraps around to find match before cursor", () => {
    const result = findNextMatch(lines, 5, "Heading One");
    expect(result).toEqual({ lineNumber: 1, query: "Heading One" });
  });

  it("returns null when no match exists", () => {
    const result = findNextMatch(lines, 1, "nonexistent");
    expect(result).toBeNull();
  });

  it("uses case-insensitive search for lowercase query", () => {
    // "foo" should match both "foo bar baz" and "FOO BAR BAZ"
    // Forward from line 1 → first hit is line 4
    const result = findNextMatch(lines, 1, "foo");
    expect(result).toEqual({ lineNumber: 4, query: "foo" });
  });

  it("uses case-sensitive search when query has uppercase (smartcase)", () => {
    // "FOO" has uppercase → case-sensitive → only matches line 5
    const result = findNextMatch(lines, 1, "FOO");
    expect(result).toEqual({ lineNumber: 5, query: "FOO" });
  });

  it("smartcase: mixed case query is case-sensitive", () => {
    const result = findNextMatch(lines, 1, "Heading");
    // "Heading" has uppercase → case-sensitive → matches line 1 wrapping or line 3
    // From cursor 1, offset 1 → line 2 (no), offset 2 → line 3 ("## Another Heading") ✓
    expect(result).toEqual({ lineNumber: 3, query: "Heading" });
  });

  it("skips current line and searches from next", () => {
    // Cursor on line 4 ("foo bar baz"), searching "foo"
    // Case-insensitive: offset 1 → line 5 "FOO BAR BAZ" matches
    const result = findNextMatch(lines, 4, "foo");
    expect(result).toEqual({ lineNumber: 5, query: "foo" });
  });

  it("finds match on current line only after full wrap", () => {
    // Only line 6 has "end". Cursor on line 6.
    // offset 1→1, 2→2, ..., 6→6 (wraps back to line 6)
    const result = findNextMatch(lines, 6, "end");
    expect(result).toEqual({ lineNumber: 6, query: "end" });
  });

  it("handles single-line input", () => {
    const result = findNextMatch(["hello world"], 1, "hello");
    expect(result).toEqual({ lineNumber: 1, query: "hello" });
  });

  it("handles empty lines array", () => {
    const result = findNextMatch([], 1, "foo");
    expect(result).toBeNull();
  });

  it("preserves original query in result", () => {
    const result = findNextMatch(lines, 1, "foo");
    expect(result!.query).toBe("foo");
  });
});
