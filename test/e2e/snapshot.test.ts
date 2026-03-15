import { describe, test, expect, afterEach } from "bun:test";
import { createHarness, type TuiHarness } from "./harness";
import { resolve } from "path";

const SPEC = resolve(import.meta.dir, "fixtures/spec.md");
const S = 350; // sequence wait (gg/dd need 300ms timeout)

describe("revspec E2E snapshots", () => {
  let harness: TuiHarness | null = null;

  afterEach(async () => {
    if (harness) { await harness.quit(); harness = null; }
  });

  test("initial render", async () => {
    harness = await createHarness(SPEC);
    expect(harness.capture()).toMatchSnapshot();
  });

  test("G scrolls to bottom", async () => {
    harness = await createHarness(SPEC);
    harness.sendKeys("G");
    await harness.wait();
    expect(harness.capture()).toMatchSnapshot();
  });

  test("j/k moves cursor", async () => {
    harness = await createHarness(SPEC);
    harness.sendKeys("jjjjj");
    await harness.wait();
    expect(harness.capture()).toMatchSnapshot();
  });

  test("Ctrl+D half page down", async () => {
    harness = await createHarness(SPEC);
    harness.sendKeys("\x04");
    await harness.wait();
    expect(harness.capture()).toMatchSnapshot();
  });

  test("/ search highlights matches", async () => {
    harness = await createHarness(SPEC);
    harness.sendKeys("/token\n");
    await harness.wait();
    expect(harness.capture()).toMatchSnapshot();
  });

  test("n jumps to next match", async () => {
    harness = await createHarness(SPEC);
    harness.sendKeys("/token\n");
    await harness.wait();
    harness.sendKeys("n");
    await harness.wait();
    expect(harness.capture()).toMatchSnapshot();
  });

  test("? opens help", async () => {
    harness = await createHarness(SPEC);
    harness.sendKeys("?");
    await harness.wait();
    expect(harness.capture()).toMatchSnapshot();
  });

  test("c opens comment input", async () => {
    harness = await createHarness(SPEC);
    harness.sendKeys("jjj");
    await harness.wait();
    harness.sendKeys("c");
    await harness.wait();
    expect(harness.capture()).toMatchSnapshot();
  });

  test("Tab submits comment", async () => {
    harness = await createHarness(SPEC);
    harness.sendKeys("jjj");
    await harness.wait();
    harness.sendKeys("c");
    await harness.wait();
    harness.sendKeys("This is a test comment\t");
    await harness.wait();
    expect(harness.capture()).toMatchSnapshot();
  });

  test("Esc switches to normal mode", async () => {
    harness = await createHarness(SPEC);
    harness.sendKeys("jjj");
    await harness.wait();
    harness.sendKeys("c");
    await harness.wait();
    harness.sendKeys("\x1b");
    await harness.wait();
    expect(harness.capture()).toMatchSnapshot();
  });

  test("thread gutter indicator", async () => {
    harness = await createHarness(SPEC);
    harness.sendKeys("jjj");
    await harness.wait();
    harness.sendKeys("c");
    await harness.wait();
    harness.sendKeys("Test thread\t");
    await harness.wait();
    harness.sendKeys("\x1b");
    await harness.wait();
    harness.sendKeys("q");
    await harness.wait();
    expect(harness.capture()).toMatchSnapshot();
  });

  test("T opens thread list", async () => {
    harness = await createHarness(SPEC);
    harness.sendKeys("T");
    await harness.wait();
    expect(harness.capture()).toMatchSnapshot();
  });

  test("r resolves thread", async () => {
    harness = await createHarness(SPEC);
    harness.sendKeys("jjj");
    await harness.wait();
    harness.sendKeys("c");
    await harness.wait();
    harness.sendKeys("Comment to resolve\t");
    await harness.wait();
    harness.sendKeys("\x1b");
    await harness.wait();
    harness.sendKeys("q");
    await harness.wait();
    harness.sendKeys("r");
    await harness.wait();
    expect(harness.capture()).toMatchSnapshot();
  });

  test("dd y deletes thread", async () => {
    harness = await createHarness(SPEC);
    harness.sendKeys("jjj");
    await harness.wait();
    harness.sendKeys("c");
    await harness.wait();
    harness.sendKeys("Comment to delete\t");
    await harness.wait();
    harness.sendKeys("\x1b");
    await harness.wait();
    harness.sendKeys("q");
    await harness.wait();
    harness.sendKeys("dd");
    await harness.wait(S);
    harness.sendKeys("y");
    await harness.wait();
    expect(harness.capture()).toMatchSnapshot();
  });

  test(":w merges review", async () => {
    harness = await createHarness(SPEC);
    harness.sendKeys(":w\n");
    await harness.wait();
    expect(harness.capture()).toMatchSnapshot();
  });

  test("bottom bar shows resolve on thread line", async () => {
    harness = await createHarness(SPEC);
    harness.sendKeys("jjj");
    await harness.wait();
    harness.sendKeys("c");
    await harness.wait();
    harness.sendKeys("hint test\t");
    await harness.wait();
    harness.sendKeys("\x1b");
    await harness.wait();
    harness.sendKeys("q");
    await harness.wait();
    expect(harness.contains("resolve")).toBe(true);
  });

  test("bottom bar hides resolve on non-thread line", async () => {
    harness = await createHarness(SPEC);
    const lines = harness.capture().split("\n");
    const bottom = lines[lines.length - 1] || "";
    expect(bottom).toContain("navigate");
    expect(bottom).not.toContain("resolve");
  });
});
