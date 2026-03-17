import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createLiveWatcher } from "../../../src/tui/live-watcher";
import type { LiveEvent } from "../../../src/protocol/live-events";

function tmpDir() {
  return mkdtempSync(join(tmpdir(), "revspec-watcher-test-"));
}

function makeEvent(overrides: Partial<LiveEvent> = {}): LiveEvent {
  return {
    type: "comment",
    threadId: "t1",
    line: 1,
    author: "owner",
    text: "hello",
    ts: Date.now(),
    ...overrides,
  } as LiveEvent;
}

describe("createLiveWatcher", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("picks up new owner events from JSONL file", async () => {
    const jsonlPath = join(dir, "test.review.jsonl");
    writeFileSync(jsonlPath, ""); // empty file

    const received: LiveEvent[][] = [];
    const watcher = createLiveWatcher(jsonlPath, (events) => {
      received.push(events);
    });

    watcher.start();

    // Append an owner event
    appendFileSync(jsonlPath, JSON.stringify(makeEvent({ author: "owner", text: "from owner" })) + "\n");

    // Wait for poll to pick it up
    await new Promise((r) => setTimeout(r, 700));
    watcher.stop();

    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0][0].author).toBe("owner");
    expect(received[0][0].text).toBe("from owner");
  });

  it("filters out reviewer events", async () => {
    const jsonlPath = join(dir, "test.review.jsonl");
    writeFileSync(jsonlPath, "");

    const received: LiveEvent[][] = [];
    const watcher = createLiveWatcher(jsonlPath, (events) => {
      received.push(events);
    });

    watcher.start();

    // Append a reviewer event only
    appendFileSync(jsonlPath, JSON.stringify(makeEvent({ author: "reviewer", text: "from reviewer" })) + "\n");

    await new Promise((r) => setTimeout(r, 700));
    watcher.stop();

    // Should not have received anything (reviewer events are filtered)
    expect(received).toHaveLength(0);
  });

  it("skips events that existed before start", async () => {
    const jsonlPath = join(dir, "test.review.jsonl");
    // Pre-populate with an event
    writeFileSync(jsonlPath, JSON.stringify(makeEvent({ text: "pre-existing" })) + "\n");

    const received: LiveEvent[][] = [];
    const watcher = createLiveWatcher(jsonlPath, (events) => {
      received.push(events);
    });

    watcher.start();

    await new Promise((r) => setTimeout(r, 700));
    watcher.stop();

    // Should not have received the pre-existing event
    expect(received).toHaveLength(0);
  });

  it("stop prevents further callbacks", async () => {
    const jsonlPath = join(dir, "test.review.jsonl");
    writeFileSync(jsonlPath, "");

    const received: LiveEvent[][] = [];
    const watcher = createLiveWatcher(jsonlPath, (events) => {
      received.push(events);
    });

    watcher.start();
    watcher.stop();

    // Append after stop
    appendFileSync(jsonlPath, JSON.stringify(makeEvent({ text: "after stop" })) + "\n");

    await new Promise((r) => setTimeout(r, 700));

    expect(received).toHaveLength(0);
  });
});
