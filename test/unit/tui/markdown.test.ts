import { describe, expect, it } from "bun:test";
import { parseInlineMarkdown, parseMarkdownLine } from "../../../src/tui/ui/markdown";
import { TextAttributes } from "@opentui/core";

describe("parseInlineMarkdown", () => {
  describe("underscore word boundaries", () => {
    it("does not parse underscores mid-word as italic", () => {
      const segments = parseInlineMarkdown("some_variable_name");
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe("some_variable_name");
      expect(segments[0].attributes).toBeUndefined();
    });

    it("does not parse UPPER_SNAKE_CASE as italic", () => {
      const segments = parseInlineMarkdown("MAX_RETRY_COUNT");
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe("MAX_RETRY_COUNT");
      expect(segments[0].attributes).toBeUndefined();
    });

    it("parses _italic text_ at word boundaries", () => {
      const segments = parseInlineMarkdown("_italic text_");
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe("italic text");
      expect(segments[0].attributes).toBe(TextAttributes.ITALIC);
    });

    it("parses __bold text__ at word boundaries", () => {
      const segments = parseInlineMarkdown("__bold text__");
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe("bold text");
      expect(segments[0].attributes).toBe(TextAttributes.BOLD);
    });

    it("does not parse underscores inside a longer identifier", () => {
      const segments = parseInlineMarkdown("use DEFAULT_TIMEOUT_MS here");
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe("use DEFAULT_TIMEOUT_MS here");
      expect(segments[0].attributes).toBeUndefined();
    });

    it("parses _italic_ surrounded by other text", () => {
      const segments = parseInlineMarkdown("this is _important_ stuff");
      expect(segments).toHaveLength(3);
      expect(segments[0].text).toBe("this is ");
      expect(segments[1].text).toBe("important");
      expect(segments[1].attributes).toBe(TextAttributes.ITALIC);
      expect(segments[2].text).toBe(" stuff");
    });
  });
});

describe("parseMarkdownLine", () => {
  it("delegates plain text to parseInlineMarkdown", () => {
    const segments = parseMarkdownLine("plain text with some_var");
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("plain text with some_var");
  });

  describe("headings", () => {
    it("keeps # prefix for h1", () => {
      const segments = parseMarkdownLine("# Title");
      expect(segments[0].text).toBe("# ");
      expect(segments[0].attributes).toBe(TextAttributes.BOLD);
      expect(segments[1].text).toBe("Title");
      expect(segments[1].attributes).toBe(TextAttributes.BOLD);
    });

    it("keeps ## prefix for h2", () => {
      const segments = parseMarkdownLine("## Subtitle");
      expect(segments[0].text).toBe("## ");
      expect(segments[1].text).toBe("Subtitle");
    });

    it("keeps ### prefix for h3", () => {
      const segments = parseMarkdownLine("### Section");
      expect(segments[0].text).toBe("### ");
      expect(segments[1].text).toBe("Section");
    });

    it("keeps ###### prefix for h6", () => {
      const segments = parseMarkdownLine("###### Deep");
      expect(segments[0].text).toBe("###### ");
      expect(segments[1].text).toBe("Deep");
    });

    it("prefix uses dim color, content uses heading color", () => {
      const segments = parseMarkdownLine("# Title");
      // Prefix is dim
      expect(segments[0].fg).toBe("#6c7086"); // theme.textDim
      // Content is blue for h1
      expect(segments[1].fg).toBe("#89b4fa"); // theme.blue
    });

    it("h3 content uses mauve color", () => {
      const segments = parseMarkdownLine("### Section");
      expect(segments[1].fg).toBe("#cba6f7"); // theme.mauve
    });

    it("h4+ content uses muted color", () => {
      const segments = parseMarkdownLine("#### Detail");
      expect(segments[1].fg).toBe("#a6adc8"); // theme.textMuted
    });

    it("parses inline markdown within heading text", () => {
      const segments = parseMarkdownLine("## A **bold** heading");
      expect(segments[0].text).toBe("## ");
      expect(segments[1].text).toBe("A ");
      expect(segments[2].text).toBe("bold");
      expect(segments[2].attributes).toBe(TextAttributes.BOLD);
      expect(segments[3].text).toBe(" heading");
    });
  });
});
