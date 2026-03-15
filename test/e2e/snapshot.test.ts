import { describe, test, expect, afterEach } from "bun:test";
import { createHarness, type TuiHarness } from "./harness";
import { resolve } from "path";

const SPEC = resolve(import.meta.dir, "fixtures/spec.md");

describe("revspec E2E snapshots", () => {
  let harness: TuiHarness | null = null;

  afterEach(async () => {
    if (harness) {
      await harness.quit();
      harness = null;
    }
  });

  test("initial render", async () => {
    harness = await createHarness(SPEC);
    await harness.wait(500);
    expect(harness.capture()).toMatchSnapshot();
  });

  test("scroll to bottom with G", async () => {
    harness = await createHarness(SPEC);
    await harness.wait(500);
    harness.sendKeys("G");
    await harness.wait(300);
    expect(harness.capture()).toMatchSnapshot();
  });

  test("scroll to top with gg", async () => {
    harness = await createHarness(SPEC);
    await harness.wait(500);
    harness.sendKeys("G");
    await harness.wait(200);
    harness.sendKeys("gg");
    await harness.wait(300);
    expect(harness.capture()).toMatchSnapshot();
  });

  test("cursor movement j/k", async () => {
    harness = await createHarness(SPEC);
    await harness.wait(500);
    // Move down 5 lines
    harness.sendKeys("jjjjj");
    await harness.wait(300);
    expect(harness.capture()).toMatchSnapshot();
  });

  test("search highlights", async () => {
    harness = await createHarness(SPEC);
    await harness.wait(500);
    harness.sendKeys("/token\n");
    await harness.wait(300);
    expect(harness.capture()).toMatchSnapshot();
  });

  test("help overlay", async () => {
    harness = await createHarness(SPEC);
    await harness.wait(500);
    harness.sendKeys("?");
    await harness.wait(300);
    expect(harness.capture()).toMatchSnapshot();
  });

  test("help overlay dismiss", async () => {
    harness = await createHarness(SPEC);
    await harness.wait(500);
    harness.sendKeys("?");
    await harness.wait(300);
    harness.sendKeys("\x1b"); // Esc
    await harness.wait(300);
    expect(harness.capture()).toMatchSnapshot();
  });
});
