# Live AI Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable real-time human-AI conversation within the revspec TUI via a shared JSONL file, with `watch` and `reply` CLI subcommands for AI tool integration.

**Architecture:** JSONL append-only event log bridges the TUI (reviewer) and AI tool (owner). The TUI writes reviewer events and watches for owner replies. Two new CLI subcommands (`watch`, `reply`) let any AI tool participate without knowing revspec internals. On session end, JSONL replays into structured review JSON.

**Tech Stack:** Bun + TypeScript, `fs.watch()` / `fs.watchFile()` for change detection, `bun:test` for testing.

**Spec:** `docs/superpowers/specs/2026-03-14-live-ai-integration-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/protocol/paths.ts` | Derive sibling file paths from spec path (review, jsonl, offset, lock) |
| `src/protocol/live-events.ts` | JSONL event types, validation, append, read-from-offset, replay-to-threads |
| `src/protocol/live-merge.ts` | Replay JSONL events → ReviewFile (merge with existing JSON) |
| `src/tui/live-watcher.ts` | File watcher that detects incoming owner replies, updates state, triggers re-render |
| `test/protocol/live-events.test.ts` | Tests for event types, validation, append, read, replay |
| `test/protocol/live-merge.test.ts` | Tests for JSONL → JSON merge |
| `test/cli-watch.test.ts` | Tests for `revspec watch` subcommand |
| `test/cli-reply.test.ts` | Tests for `revspec reply` subcommand |
| `test/e2e-live.test.ts` | End-to-end test: TUI writes → watch detects → reply appends → TUI reads |

### Modified files

| File | Changes |
|------|---------|
| `src/protocol/types.ts` | `Message.author` → `"reviewer" \| "owner"`, add optional `ts` field |
| `src/state/review-state.ts` | Add unread tracking, `addOwnerReply()`, `nextUnreadThread()`, `prevUnreadThread()`, `unreadCount()`, `markRead()` |
| `bin/revspec.ts` | Subcommand routing (`watch`, `reply`), updated merge-on-exit to use JSONL |
| `src/tui/app.ts` | Write to JSONL on actions, start live watcher, `]r`/`[r` keybindings, updated quit semantics |
| `src/tui/pager.ts` | Unread indicator on thread lines |
| `src/tui/comment-input.ts` | Timestamp display in thread popup |
| `src/tui/status-bar.ts` | Show unread owner reply count |
| `test/protocol/types.test.ts` | Update for reviewer/owner, ts field |
| `test/state/review-state.test.ts` | Tests for unread tracking |

---

## Chunk 1: Protocol Foundation

### Task 1: Update Message type (reviewer/owner + ts)

**Files:**
- Modify: `src/protocol/types.ts`
- Modify: `test/protocol/types.test.ts`
- Modify: `src/tui/comment-input.ts` (author label references)

- [ ] **Step 1: Update type definition**

In `src/protocol/types.ts`, change `Message`:
```typescript
export interface Message {
  author: "reviewer" | "owner"
  text: string
  ts?: number
}
```

Update `isValidThread` to accept both old (`human`/`ai`) and new (`reviewer`/`owner`) author values for backward compat during migration.

- [ ] **Step 2: Update tests**

In `test/protocol/types.test.ts`, update all test fixtures from `"human"`/`"ai"` to `"reviewer"`/`"owner"`. Add test that `ts` is optional.

- [ ] **Step 3: Update comment-input.ts author labels**

In `src/tui/comment-input.ts`, change the author display labels:
- `"human"` → `"reviewer"`, display as `"You"`
- `"ai"` → `"owner"`, display as `" AI"` (or keep generic based on author value)

- [ ] **Step 4: Update all test fixtures across the codebase**

Update `test/protocol/merge.test.ts`, `test/protocol/read.test.ts`, `test/protocol/write.test.ts`, `test/state/review-state.test.ts`, `test/cli.test.ts` — replace all `"human"` with `"reviewer"` and `"ai"` with `"owner"` in test data.

- [ ] **Step 5: Run all tests**

Run: `bun test`
Expected: All tests pass with updated author values.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: change Message author from human/ai to reviewer/owner, add optional ts"
```

---

### Task 2: JSONL event types and validation

**Files:**
- Create: `src/protocol/live-events.ts`
- Create: `test/protocol/live-events.test.ts`

- [ ] **Step 1: Write failing tests for event types**

In `test/protocol/live-events.test.ts`:
```typescript
import { describe, it, expect } from "bun:test"
import {
  type LiveEvent,
  isValidLiveEvent,
  appendEvent,
  readEventsFromOffset,
  replayEventsToThreads,
} from "../../src/protocol/live-events"

describe("isValidLiveEvent", () => {
  it("accepts a valid comment event", () => {
    const event = { type: "comment", threadId: "t1", line: 14, author: "reviewer", text: "unclear", ts: 1000 }
    expect(isValidLiveEvent(event)).toBe(true)
  })

  it("accepts a valid reply event", () => {
    const event = { type: "reply", threadId: "t1", author: "owner", text: "fixed", ts: 1001 }
    expect(isValidLiveEvent(event)).toBe(true)
  })

  it("accepts a valid resolve event", () => {
    const event = { type: "resolve", threadId: "t1", author: "reviewer", ts: 1002 }
    expect(isValidLiveEvent(event)).toBe(true)
  })

  it("accepts a valid approve event (no threadId)", () => {
    const event = { type: "approve", author: "reviewer", ts: 1003 }
    expect(isValidLiveEvent(event)).toBe(true)
  })

  it("accepts a valid round event (no threadId)", () => {
    const event = { type: "round", author: "reviewer", round: 2, ts: 1004 }
    expect(isValidLiveEvent(event)).toBe(true)
  })

  it("accepts a valid delete event", () => {
    const event = { type: "delete", threadId: "t1", author: "reviewer", ts: 1005 }
    expect(isValidLiveEvent(event)).toBe(true)
  })

  it("rejects event missing type", () => {
    expect(isValidLiveEvent({ threadId: "t1", author: "reviewer", ts: 1 })).toBe(false)
  })

  it("rejects event with invalid type", () => {
    expect(isValidLiveEvent({ type: "unknown", threadId: "t1", author: "reviewer", ts: 1 })).toBe(false)
  })

  it("rejects comment missing text", () => {
    expect(isValidLiveEvent({ type: "comment", threadId: "t1", line: 1, author: "reviewer", ts: 1 })).toBe(false)
  })

  it("rejects comment missing line", () => {
    expect(isValidLiveEvent({ type: "comment", threadId: "t1", author: "reviewer", text: "x", ts: 1 })).toBe(false)
  })

  it("rejects event missing ts", () => {
    expect(isValidLiveEvent({ type: "resolve", threadId: "t1", author: "reviewer" })).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/protocol/live-events.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement event types and validation**

Create `src/protocol/live-events.ts`:
```typescript
import { appendFileSync, readFileSync, existsSync, statSync } from "fs"
import type { Thread, Message, Status } from "./types"

export type LiveEventType = "comment" | "reply" | "resolve" | "unresolve" | "approve" | "delete" | "round"

export interface LiveEvent {
  type: LiveEventType
  threadId?: string
  line?: number
  author: "reviewer" | "owner"
  text?: string
  ts: number
  round?: number
}

const VALID_TYPES: LiveEventType[] = ["comment", "reply", "resolve", "unresolve", "approve", "delete", "round"]

export function isValidLiveEvent(value: unknown): value is LiveEvent {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>

  if (!VALID_TYPES.includes(v.type as LiveEventType)) return false
  if (typeof v.ts !== "number") return false
  if (typeof v.author !== "string") return false

  const type = v.type as LiveEventType

  // threadId required for all except approve and round
  if (type !== "approve" && type !== "round") {
    if (typeof v.threadId !== "string") return false
  }

  // text required for comment and reply
  if (type === "comment" || type === "reply") {
    if (typeof v.text !== "string") return false
  }

  // line required for comment
  if (type === "comment") {
    if (typeof v.line !== "number") return false
  }

  // round field required for round event
  if (type === "round") {
    if (typeof v.round !== "number") return false
  }

  return true
}

export function appendEvent(jsonlPath: string, event: LiveEvent): void {
  appendFileSync(jsonlPath, JSON.stringify(event) + "\n")
}

export interface ReadResult {
  events: LiveEvent[]
  newOffset: number
}

export function readEventsFromOffset(jsonlPath: string, offset: number): ReadResult {
  if (!existsSync(jsonlPath)) return { events: [], newOffset: offset }

  const stat = statSync(jsonlPath)
  if (stat.size <= offset) return { events: [], newOffset: offset }

  const buf = readFileSync(jsonlPath)
  const actualSize = buf.length // Use actual bytes read, not stat.size, to avoid race with concurrent writers
  let startOffset = offset

  // Alignment safety: if offset > 0, skip to next \n boundary
  if (startOffset > 0 && startOffset < buf.length) {
    while (startOffset < buf.length && buf[startOffset] !== 0x0a) {
      startOffset++
    }
    if (startOffset < buf.length) startOffset++ // skip the \n itself
  }

  const chunk = buf.subarray(startOffset).toString("utf-8")
  const lines = chunk.split("\n").filter((l) => l.trim().length > 0)
  const events: LiveEvent[] = []

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      if (isValidLiveEvent(parsed)) {
        events.push(parsed)
      }
    } catch {
      // Discard malformed lines (partial writes)
    }
  }

  return { events, newOffset: actualSize }
}

export function replayEventsToThreads(events: LiveEvent[]): Thread[] {
  const threadMap = new Map<string, Thread>()
  const deleteCounts = new Map<string, number>() // track deletes per thread

  for (const event of events) {
    if (event.type === "approve" || event.type === "round") continue

    const tid = event.threadId!

    if (event.type === "comment") {
      threadMap.set(tid, {
        id: tid,
        line: event.line!,
        status: "open" as Status,
        messages: [{ author: event.author, text: event.text!, ts: event.ts }],
      })
      deleteCounts.set(tid, 0)
    } else if (event.type === "reply") {
      const thread = threadMap.get(tid)
      if (!thread) continue
      thread.messages.push({ author: event.author, text: event.text!, ts: event.ts })
      thread.status = event.author === "owner" ? "pending" : "open"
    } else if (event.type === "resolve") {
      const thread = threadMap.get(tid)
      if (thread) thread.status = "resolved"
    } else if (event.type === "unresolve") {
      const thread = threadMap.get(tid)
      if (thread) thread.status = "open"
    } else if (event.type === "delete") {
      const thread = threadMap.get(tid)
      if (!thread) continue
      // Find last reviewer message and remove it
      for (let i = thread.messages.length - 1; i >= 0; i--) {
        if (thread.messages[i].author === "reviewer") {
          thread.messages.splice(i, 1)
          break
        }
      }
    }
  }

  // Exclude empty threads (all messages deleted)
  return Array.from(threadMap.values()).filter((t) => t.messages.length > 0)
}
```

- [ ] **Step 4: Run tests**

Run: `bun test test/protocol/live-events.test.ts`
Expected: All validation tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/protocol/live-events.ts test/protocol/live-events.test.ts
git commit -m "feat: add JSONL live event types, validation, append, read, replay"
```

---

### Task 3: JSONL append and read-from-offset tests

**Files:**
- Modify: `test/protocol/live-events.test.ts`

- [ ] **Step 1: Write tests for append and read**

Add to `test/protocol/live-events.test.ts`:
```typescript
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

describe("appendEvent + readEventsFromOffset", () => {
  let dir: string
  let jsonlPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "revspec-live-"))
    jsonlPath = join(dir, "test.review.live.jsonl")
  })

  afterEach(() => rmSync(dir, { recursive: true }))

  it("appends events and reads them back from offset 0", () => {
    const e1: LiveEvent = { type: "comment", threadId: "t1", line: 5, author: "reviewer", text: "fix this", ts: 1000 }
    const e2: LiveEvent = { type: "reply", threadId: "t1", author: "owner", text: "done", ts: 1001 }
    appendEvent(jsonlPath, e1)
    appendEvent(jsonlPath, e2)

    const result = readEventsFromOffset(jsonlPath, 0)
    expect(result.events).toHaveLength(2)
    expect(result.events[0].type).toBe("comment")
    expect(result.events[1].type).toBe("reply")
    expect(result.newOffset).toBeGreaterThan(0)
  })

  it("reads only new events from a given offset", () => {
    const e1: LiveEvent = { type: "comment", threadId: "t1", line: 5, author: "reviewer", text: "fix this", ts: 1000 }
    appendEvent(jsonlPath, e1)

    const first = readEventsFromOffset(jsonlPath, 0)
    expect(first.events).toHaveLength(1)

    const e2: LiveEvent = { type: "reply", threadId: "t1", author: "owner", text: "done", ts: 1001 }
    appendEvent(jsonlPath, e2)

    const second = readEventsFromOffset(jsonlPath, first.newOffset)
    expect(second.events).toHaveLength(1)
    expect(second.events[0].type).toBe("reply")
  })

  it("returns empty for non-existent file", () => {
    const result = readEventsFromOffset(join(dir, "nope.jsonl"), 0)
    expect(result.events).toHaveLength(0)
  })

  it("discards malformed lines gracefully", () => {
    const { appendFileSync } = require("fs")
    appendFileSync(jsonlPath, '{"type":"comment","threadId":"t1","line":1,"author":"reviewer","text":"ok","ts":1}\n')
    appendFileSync(jsonlPath, "this is not json\n")
    appendFileSync(jsonlPath, '{"type":"reply","threadId":"t1","author":"owner","text":"yes","ts":2}\n')

    const result = readEventsFromOffset(jsonlPath, 0)
    expect(result.events).toHaveLength(2)
  })

  it("handles byte offset alignment (mid-line offset)", () => {
    const e1: LiveEvent = { type: "comment", threadId: "t1", line: 5, author: "reviewer", text: "fix", ts: 1000 }
    const e2: LiveEvent = { type: "reply", threadId: "t1", author: "owner", text: "done", ts: 1001 }
    appendEvent(jsonlPath, e1)
    appendEvent(jsonlPath, e2)

    // Read from offset 5 (middle of first line) — should skip to second line
    const result = readEventsFromOffset(jsonlPath, 5)
    expect(result.events).toHaveLength(1)
    expect(result.events[0].type).toBe("reply")
  })
})
```

- [ ] **Step 2: Run tests**

Run: `bun test test/protocol/live-events.test.ts`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add test/protocol/live-events.test.ts
git commit -m "test: add append and read-from-offset tests for live events"
```

---

### Task 4: Replay events to threads

**Files:**
- Modify: `test/protocol/live-events.test.ts`

- [ ] **Step 1: Write tests for replayEventsToThreads**

Add to `test/protocol/live-events.test.ts`:
```typescript
describe("replayEventsToThreads", () => {
  it("creates threads from comment events", () => {
    const events: LiveEvent[] = [
      { type: "comment", threadId: "t1", line: 10, author: "reviewer", text: "fix this", ts: 1000 },
      { type: "comment", threadId: "t2", line: 20, author: "reviewer", text: "and this", ts: 1001 },
    ]
    const threads = replayEventsToThreads(events)
    expect(threads).toHaveLength(2)
    expect(threads[0].id).toBe("t1")
    expect(threads[0].line).toBe(10)
    expect(threads[0].status).toBe("open")
    expect(threads[0].messages).toHaveLength(1)
  })

  it("appends replies to existing threads", () => {
    const events: LiveEvent[] = [
      { type: "comment", threadId: "t1", line: 10, author: "reviewer", text: "fix", ts: 1000 },
      { type: "reply", threadId: "t1", author: "owner", text: "done", ts: 1001 },
    ]
    const threads = replayEventsToThreads(events)
    expect(threads[0].messages).toHaveLength(2)
    expect(threads[0].status).toBe("pending")
  })

  it("sets status to open on reviewer reply", () => {
    const events: LiveEvent[] = [
      { type: "comment", threadId: "t1", line: 10, author: "reviewer", text: "fix", ts: 1000 },
      { type: "reply", threadId: "t1", author: "owner", text: "done", ts: 1001 },
      { type: "reply", threadId: "t1", author: "reviewer", text: "not quite", ts: 1002 },
    ]
    const threads = replayEventsToThreads(events)
    expect(threads[0].status).toBe("open")
  })

  it("handles resolve and unresolve", () => {
    const events: LiveEvent[] = [
      { type: "comment", threadId: "t1", line: 10, author: "reviewer", text: "fix", ts: 1000 },
      { type: "resolve", threadId: "t1", author: "reviewer", ts: 1001 },
    ]
    const threads = replayEventsToThreads(events)
    expect(threads[0].status).toBe("resolved")
  })

  it("handles delete — removes last reviewer message", () => {
    const events: LiveEvent[] = [
      { type: "comment", threadId: "t1", line: 10, author: "reviewer", text: "wrong comment", ts: 1000 },
      { type: "reply", threadId: "t1", author: "owner", text: "hmm", ts: 1001 },
      { type: "delete", threadId: "t1", author: "reviewer", ts: 1002 },
    ]
    const threads = replayEventsToThreads(events)
    // The original comment (last reviewer msg) should be removed
    expect(threads[0].messages).toHaveLength(1)
    expect(threads[0].messages[0].author).toBe("owner")
  })

  it("excludes empty threads after all messages deleted", () => {
    const events: LiveEvent[] = [
      { type: "comment", threadId: "t1", line: 10, author: "reviewer", text: "oops", ts: 1000 },
      { type: "delete", threadId: "t1", author: "reviewer", ts: 1001 },
    ]
    const threads = replayEventsToThreads(events)
    expect(threads).toHaveLength(0)
  })

  it("skips approve and round events", () => {
    const events: LiveEvent[] = [
      { type: "round", author: "reviewer", round: 1, ts: 999 },
      { type: "comment", threadId: "t1", line: 10, author: "reviewer", text: "fix", ts: 1000 },
      { type: "approve", author: "reviewer", ts: 1001 },
    ]
    const threads = replayEventsToThreads(events)
    expect(threads).toHaveLength(1)
  })

  it("preserves timestamps on messages", () => {
    const events: LiveEvent[] = [
      { type: "comment", threadId: "t1", line: 10, author: "reviewer", text: "fix", ts: 1000 },
      { type: "reply", threadId: "t1", author: "owner", text: "done", ts: 1005 },
    ]
    const threads = replayEventsToThreads(events)
    expect(threads[0].messages[0].ts).toBe(1000)
    expect(threads[0].messages[1].ts).toBe(1005)
  })

  it("ignores replies to unknown threads", () => {
    const events: LiveEvent[] = [
      { type: "reply", threadId: "t99", author: "owner", text: "huh?", ts: 1000 },
    ]
    const threads = replayEventsToThreads(events)
    expect(threads).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `bun test test/protocol/live-events.test.ts`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add test/protocol/live-events.test.ts
git commit -m "test: add replay-events-to-threads tests"
```

---

### Task 5: JSONL → JSON merge

**Files:**
- Create: `src/protocol/live-merge.ts`
- Create: `test/protocol/live-merge.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/protocol/live-merge.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { mergeJsonlIntoReview } from "../../src/protocol/live-merge"
import { appendEvent, type LiveEvent } from "../../src/protocol/live-events"
import type { ReviewFile } from "../../src/protocol/types"

describe("mergeJsonlIntoReview", () => {
  let dir: string

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "revspec-merge-")) })
  afterEach(() => rmSync(dir, { recursive: true }))

  it("creates new review from JSONL events", () => {
    const jsonlPath = join(dir, "test.review.live.jsonl")
    appendEvent(jsonlPath, { type: "comment", threadId: "t1", line: 10, author: "reviewer", text: "fix", ts: 1000 })
    appendEvent(jsonlPath, { type: "reply", threadId: "t1", author: "owner", text: "done", ts: 1001 })
    appendEvent(jsonlPath, { type: "resolve", threadId: "t1", author: "reviewer", ts: 1002 })

    const result = mergeJsonlIntoReview(jsonlPath, null, "spec.md")
    expect(result.file).toBe("spec.md")
    expect(result.threads).toHaveLength(1)
    expect(result.threads[0].status).toBe("resolved")
    expect(result.threads[0].messages).toHaveLength(2)
  })

  it("merges JSONL threads with existing review threads", () => {
    const jsonlPath = join(dir, "test.review.live.jsonl")
    const existing: ReviewFile = {
      file: "spec.md",
      threads: [
        { id: "t1", line: 5, status: "resolved", messages: [{ author: "reviewer", text: "old" }] },
      ],
    }

    appendEvent(jsonlPath, { type: "comment", threadId: "t2", line: 20, author: "reviewer", text: "new", ts: 2000 })

    const result = mergeJsonlIntoReview(jsonlPath, existing, "spec.md")
    expect(result.threads).toHaveLength(2)
    expect(result.threads[0].id).toBe("t1") // existing preserved
    expect(result.threads[1].id).toBe("t2") // new added
  })

  it("appends new messages to existing thread (same ID)", () => {
    const jsonlPath = join(dir, "test.review.live.jsonl")
    const existing: ReviewFile = {
      file: "spec.md",
      threads: [
        { id: "t1", line: 10, status: "pending", messages: [
          { author: "reviewer", text: "fix", ts: 1000 },
          { author: "owner", text: "done", ts: 1001 },
        ]},
      ],
    }

    // New round: reviewer replies again
    appendEvent(jsonlPath, { type: "reply", threadId: "t1", author: "reviewer", text: "not quite", ts: 2000 })

    const result = mergeJsonlIntoReview(jsonlPath, existing, "spec.md")
    expect(result.threads[0].messages).toHaveLength(3)
    expect(result.threads[0].status).toBe("open") // reviewer replied, so open
  })

  it("returns existing review unchanged if JSONL is empty", () => {
    const jsonlPath = join(dir, "test.review.live.jsonl")
    const existing: ReviewFile = {
      file: "spec.md",
      threads: [{ id: "t1", line: 5, status: "resolved", messages: [{ author: "reviewer", text: "ok" }] }],
    }

    // Empty JSONL (file doesn't exist)
    const result = mergeJsonlIntoReview(jsonlPath, existing, "spec.md")
    expect(result.threads).toHaveLength(1)
    expect(result.threads[0].status).toBe("resolved")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/protocol/live-merge.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement live-merge**

Create `src/protocol/live-merge.ts`:
```typescript
import { readEventsFromOffset, replayEventsToThreads } from "./live-events"
import type { ReviewFile, Thread } from "./types"

export function mergeJsonlIntoReview(
  jsonlPath: string,
  existingReview: ReviewFile | null,
  specFile: string
): ReviewFile {
  const { events } = readEventsFromOffset(jsonlPath, 0) // Always replay from byte 0
  const jsonlThreads = replayEventsToThreads(events)

  const review: ReviewFile = existingReview
    ? { file: existingReview.file, threads: [...existingReview.threads] }
    : { file: specFile, threads: [] }

  for (const jsonlThread of jsonlThreads) {
    const existingIdx = review.threads.findIndex((t) => t.id === jsonlThread.id)

    if (existingIdx === -1) {
      // New thread — add it
      review.threads.push(jsonlThread)
    } else {
      // Existing thread — append only new messages, update status
      const existing = review.threads[existingIdx]
      const newMessages = jsonlThread.messages.slice(existing.messages.length)
      existing.messages.push(...newMessages)
      existing.status = jsonlThread.status
    }
  }

  return review
}
```

- [ ] **Step 4: Run tests**

Run: `bun test test/protocol/live-merge.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/protocol/live-merge.ts test/protocol/live-merge.test.ts
git commit -m "feat: add JSONL to review JSON merge"
```

---

## Chunk 2: CLI Subcommands

### Task 6: Subcommand routing in CLI entry point

**Files:**
- Modify: `bin/revspec.ts`

- [ ] **Step 1: Add subcommand dispatch**

At the top of `bin/revspec.ts`, before the existing logic, add subcommand routing:
```typescript
const args = process.argv.slice(2)
const subcommand = args[0]

if (subcommand === "watch") {
  const specFile = args[1]
  if (!specFile) { console.error("Usage: revspec watch <file.md>"); process.exit(1) }
  const { runWatch } = await import("../src/cli/watch")
  await runWatch(specFile)
  process.exit(0)
}

if (subcommand === "reply") {
  const specFile = args[1]
  const threadId = args[2]
  const text = args[3]
  if (!specFile || !threadId || !text) {
    console.error("Usage: revspec reply <file.md> <threadId> \"<text>\"")
    process.exit(1)
  }
  const { runReply } = await import("../src/cli/reply")
  runReply(specFile, threadId, text)
  process.exit(0)
}

// ... existing revspec <file.md> logic continues
```

- [ ] **Step 2: Run existing tests to ensure no regression**

Run: `bun test test/cli.test.ts`
Expected: All pass — existing behavior unchanged for `revspec <file.md>`.

- [ ] **Step 3: Commit**

```bash
git add bin/revspec.ts
git commit -m "feat: add subcommand routing for watch and reply"
```

---

### Task 7: `revspec reply` subcommand

**Files:**
- Create: `src/cli/reply.ts`
- Create: `test/cli-reply.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/cli-reply.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { appendEvent, readEventsFromOffset } from "../src/protocol/live-events"

const CLI = join(import.meta.dir, "..", "bin", "revspec.ts")

describe("revspec reply", () => {
  let dir: string
  let specPath: string
  let jsonlPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "revspec-reply-"))
    specPath = join(dir, "spec.md")
    jsonlPath = join(dir, "spec.review.live.jsonl")
    writeFileSync(specPath, "# Test Spec\nLine 2\nLine 3\n")
    // Create a comment so thread t1 exists
    appendEvent(jsonlPath, { type: "comment", threadId: "t1", line: 1, author: "reviewer", text: "fix this", ts: 1000 })
  })

  afterEach(() => rmSync(dir, { recursive: true }))

  it("appends an owner reply event to the JSONL", async () => {
    const proc = Bun.spawn(["bun", "run", CLI, "reply", specPath, "t1", "I fixed it"], {
      stdout: "pipe", stderr: "pipe",
    })
    await proc.exited
    expect(proc.exitCode).toBe(0)

    const { events } = readEventsFromOffset(jsonlPath, 0)
    expect(events).toHaveLength(2)
    expect(events[1].type).toBe("reply")
    expect(events[1].author).toBe("owner")
    expect(events[1].text).toBe("I fixed it")
  })

  it("exits 1 for unknown thread ID", async () => {
    const proc = Bun.spawn(["bun", "run", CLI, "reply", specPath, "t99", "text"], {
      stdout: "pipe", stderr: "pipe",
    })
    await proc.exited
    expect(proc.exitCode).toBe(1)
  })

  it("exits 1 for empty text", async () => {
    const proc = Bun.spawn(["bun", "run", CLI, "reply", specPath, "t1", ""], {
      stdout: "pipe", stderr: "pipe",
    })
    await proc.exited
    expect(proc.exitCode).toBe(1)
  })

  it("preserves newlines in reply text via JSON escaping", async () => {
    const proc = Bun.spawn(["bun", "run", CLI, "reply", specPath, "t1", "line 1\nline 2"], {
      stdout: "pipe", stderr: "pipe",
    })
    await proc.exited
    expect(proc.exitCode).toBe(0)

    const { events } = readEventsFromOffset(jsonlPath, 0)
    expect(events[1].text).toBe("line 1\nline 2")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/cli-reply.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement reply subcommand**

Create `src/cli/reply.ts`:
```typescript
import { existsSync } from "fs"
import { resolve, dirname, basename } from "path"
import { appendEvent, readEventsFromOffset } from "../protocol/live-events"

export function runReply(specFile: string, threadId: string, text: string): void {
  const specPath = resolve(specFile)
  if (!existsSync(specPath)) {
    console.error(`Spec file not found: ${specPath}`)
    process.exit(1)
  }

  if (!text || text.trim().length === 0) {
    console.error("Reply text cannot be empty")
    process.exit(1)
  }

  const dir = dirname(specPath)
  const base = basename(specPath, ".md")
  const jsonlPath = `${dir}/${base}.review.live.jsonl`

  if (!existsSync(jsonlPath)) {
    console.error(`No live session found: ${jsonlPath}`)
    process.exit(1)
  }

  // Validate thread exists
  const { events } = readEventsFromOffset(jsonlPath, 0)
  const threadExists = events.some((e) => e.threadId === threadId)
  if (!threadExists) {
    console.error(`Thread ${threadId} not found`)
    process.exit(1)
  }

  appendEvent(jsonlPath, {
    type: "reply",
    threadId,
    author: "owner",
    text,
    ts: Date.now(),
  })
}
```

- [ ] **Step 4: Run tests**

Run: `bun test test/cli-reply.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/reply.ts test/cli-reply.test.ts
git commit -m "feat: add revspec reply subcommand"
```

---

### Task 8: `revspec watch` subcommand

**Files:**
- Create: `src/cli/watch.ts`
- Create: `test/cli-watch.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/cli-watch.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { appendEvent } from "../src/protocol/live-events"

const CLI = join(import.meta.dir, "..", "bin", "revspec.ts")

describe("revspec watch", () => {
  let dir: string
  let specPath: string
  let jsonlPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "revspec-watch-"))
    specPath = join(dir, "spec.md")
    jsonlPath = join(dir, "spec.review.live.jsonl")
    writeFileSync(specPath, "# Title\nLine 2\nLine 3\nLine 4\nLine 5\n")
  })

  afterEach(() => rmSync(dir, { recursive: true }))

  it("returns new comments with context when JSONL has reviewer events", async () => {
    appendEvent(jsonlPath, { type: "comment", threadId: "t1", line: 3, author: "reviewer", text: "fix this line", ts: 1000 })

    const proc = Bun.spawn(["bun", "run", CLI, "watch", specPath], {
      stdout: "pipe", stderr: "pipe",
      env: { ...process.env, REVSPEC_WATCH_NO_BLOCK: "1" },
    })
    const output = await new Response(proc.stdout).text()
    await proc.exited

    expect(proc.exitCode).toBe(0)
    expect(output).toContain("[t1]")
    expect(output).toContain("line 3")
    expect(output).toContain("fix this line")
    expect(output).toContain("revspec reply")
  })

  it("returns approval message when approve event present", async () => {
    appendEvent(jsonlPath, { type: "comment", threadId: "t1", line: 1, author: "reviewer", text: "ok", ts: 1000 })
    appendEvent(jsonlPath, { type: "resolve", threadId: "t1", author: "reviewer", ts: 1001 })
    appendEvent(jsonlPath, { type: "approve", author: "reviewer", ts: 1002 })

    const proc = Bun.spawn(["bun", "run", CLI, "watch", specPath], {
      stdout: "pipe", stderr: "pipe",
      env: { ...process.env, REVSPEC_WATCH_NO_BLOCK: "1" },
    })
    const output = await new Response(proc.stdout).text()
    await proc.exited

    expect(proc.exitCode).toBe(0)
    expect(output).toContain("Review approved")
  })

  it("includes thread history for replies", async () => {
    appendEvent(jsonlPath, { type: "comment", threadId: "t1", line: 3, author: "reviewer", text: "fix", ts: 1000 })
    appendEvent(jsonlPath, { type: "reply", threadId: "t1", author: "owner", text: "done", ts: 1001 })
    appendEvent(jsonlPath, { type: "reply", threadId: "t1", author: "reviewer", text: "not quite", ts: 1002 })

    const proc = Bun.spawn(["bun", "run", CLI, "watch", specPath], {
      stdout: "pipe", stderr: "pipe",
      env: { ...process.env, REVSPEC_WATCH_NO_BLOCK: "1" },
    })
    const output = await new Response(proc.stdout).text()
    await proc.exited

    expect(output).toContain("Thread history")
    expect(output).toContain("not quite")
  })

  it("shows resolved threads separately", async () => {
    appendEvent(jsonlPath, { type: "comment", threadId: "t1", line: 1, author: "reviewer", text: "fix", ts: 1000 })
    appendEvent(jsonlPath, { type: "resolve", threadId: "t1", author: "reviewer", ts: 1001 })

    const proc = Bun.spawn(["bun", "run", CLI, "watch", specPath], {
      stdout: "pipe", stderr: "pipe",
      env: { ...process.env, REVSPEC_WATCH_NO_BLOCK: "1" },
    })
    const output = await new Response(proc.stdout).text()
    await proc.exited

    expect(output).toContain("Resolved")
    expect(output).toContain("resolved by reviewer")
  })

  it("exits 1 for missing spec file", async () => {
    const proc = Bun.spawn(["bun", "run", CLI, "watch", join(dir, "nope.md")], {
      stdout: "pipe", stderr: "pipe",
      env: { ...process.env, REVSPEC_WATCH_NO_BLOCK: "1" },
    })
    await proc.exited
    expect(proc.exitCode).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/cli-watch.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement watch subcommand**

Create `src/cli/watch.ts`:
```typescript
import { existsSync, readFileSync, writeFileSync, unlinkSync, watch as fsWatch, statSync } from "fs"
import { resolve, dirname, basename } from "path"
import { readEventsFromOffset, type LiveEvent } from "../protocol/live-events"

export async function runWatch(specFile: string): Promise<void> {
  const specPath = resolve(specFile)
  if (!existsSync(specPath)) {
    console.error(`Spec file not found: ${specPath}`)
    process.exit(1)
  }

  const dir = dirname(specPath)
  const base = basename(specPath, ".md")
  const jsonlPath = `${dir}/${base}.review.live.jsonl`
  const offsetPath = `${dir}/${base}.review.live.offset`
  const lockPath = `${dir}/${base}.review.live.lock`
  const reviewPath = `${dir}/${base}.review.json`

  // Lock file check
  if (existsSync(lockPath)) {
    const lockPid = parseInt(readFileSync(lockPath, "utf-8").trim(), 10)
    if (!isNaN(lockPid) && isProcessAlive(lockPid)) {
      console.error("Another watch process is already running")
      process.exit(3)
    }
  }
  writeFileSync(lockPath, String(process.pid))

  // Read last offset
  let offset = 0
  if (existsSync(offsetPath)) {
    offset = parseInt(readFileSync(offsetPath, "utf-8").trim(), 10) || 0
  }

  const specLines = readFileSync(specPath, "utf-8").split("\n")

  // Non-blocking mode for tests
  if (process.env.REVSPEC_WATCH_NO_BLOCK === "1") {
    const result = processNewEvents(jsonlPath, offset, specPath, specLines, reviewPath)
    if (result) {
      writeFileSync(offsetPath, String(result.newOffset))
      console.log(result.output)
    }
    return
  }

  // Blocking mode: wait for JSONL changes
  await waitForEvents(jsonlPath, offset, specPath, specLines, offsetPath, lockPath, reviewPath)
}

function processNewEvents(
  jsonlPath: string,
  offset: number,
  specPath: string,
  specLines: string[],
  reviewPath: string
): { output: string; newOffset: number } | null {
  const { events, newOffset } = readEventsFromOffset(jsonlPath, offset)
  if (events.length === 0) return null

  // Check for approve
  const approveEvent = events.find((e) => e.type === "approve")
  if (approveEvent) {
    return {
      output: `Review approved.\nReview file: ${reviewPath}`,
      newOffset,
    }
  }

  // Filter reviewer events only
  const reviewerEvents = events.filter((e) => e.author === "reviewer" && e.type !== "round")
  if (reviewerEvents.length === 0) return null

  // Build full thread state for context
  const { events: allEvents } = readEventsFromOffset(jsonlPath, 0)
  const output = formatWatchOutput(reviewerEvents, allEvents, specPath, specLines)

  return { output, newOffset }
}

function formatWatchOutput(
  newEvents: LiveEvent[],
  allEvents: LiveEvent[],
  specPath: string,
  specLines: string[]
): string {
  const sections: string[] = []

  // Group by type
  const newComments = newEvents.filter((e) => e.type === "comment")
  const replies = newEvents.filter((e) => e.type === "reply")
  const resolves = newEvents.filter((e) => e.type === "resolve")
  const deletes = newEvents.filter((e) => e.type === "delete")

  if (resolves.length > 0) {
    sections.push("--- Resolved ---\n")
    for (const e of resolves) {
      const line = findThreadLine(allEvents, e.threadId!)
      sections.push(`[${e.threadId}] line ${line}: resolved by reviewer\n`)
    }
  }

  if (deletes.length > 0) {
    sections.push("--- Deleted ---\n")
    for (const e of deletes) {
      const line = findThreadLine(allEvents, e.threadId!)
      sections.push(`[${e.threadId}] line ${line}: reviewer retracted last message\n`)
    }
  }

  if (newComments.length > 0) {
    sections.push("--- New threads ---\n")
    for (const e of newComments) {
      const context = getContext(specLines, e.line!)
      sections.push(`[${e.threadId}] line ${e.line} (new):`)
      sections.push(`  Context:`)
      sections.push(context)
      sections.push(`  Comment: "${e.text}"\n`)
    }
  }

  if (replies.length > 0) {
    sections.push("--- Replies ---\n")
    for (const e of replies) {
      const line = findThreadLine(allEvents, e.threadId!)
      const history = getThreadHistory(allEvents, e.threadId!)
      sections.push(`[${e.threadId}] line ${line} (reply):`)
      sections.push(`  Thread history:`)
      sections.push(history)
      sections.push(`  Comment: "${e.text}"\n`)
    }
  }

  if (newComments.length > 0 || replies.length > 0) {
    const specBase = basename(specPath)
    sections.push(`To reply: revspec reply ${specBase} <threadId> "<your response>"`)
    sections.push(`When done replying, run: revspec watch ${specBase}`)
  }

  return sections.join("\n")
}

function getContext(specLines: string[], line: number): string {
  const lines: string[] = []
  const start = Math.max(0, line - 3)
  const end = Math.min(specLines.length - 1, line + 1)
  for (let i = start; i <= end; i++) {
    const lineNum = i + 1
    const prefix = lineNum === line ? "   >" : "    "
    lines.push(`${prefix}${lineNum}: ${specLines[i]}`)
  }
  return lines.join("\n")
}

function getThreadHistory(allEvents: LiveEvent[], threadId: string): string {
  const msgs = allEvents
    .filter((e) => e.threadId === threadId && (e.type === "comment" || e.type === "reply"))
    .map((e) => `    ${e.author}: "${e.text}"`)
  return msgs.join("\n")
}

function findThreadLine(allEvents: LiveEvent[], threadId: string): number {
  const comment = allEvents.find((e) => e.type === "comment" && e.threadId === threadId)
  return comment?.line ?? 0
}

async function waitForEvents(
  jsonlPath: string,
  offset: number,
  specPath: string,
  specLines: string[],
  offsetPath: string,
  lockPath: string,
  reviewPath: string
): Promise<void> {
  return new Promise<void>((resolvePromise) => {
    let currentOffset = offset
    let watcher: ReturnType<typeof fsWatch> | null = null
    let pollInterval: ReturnType<typeof setInterval> | null = null

    function cleanup() {
      if (watcher) { watcher.close(); watcher = null }
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
    }

    function check(): boolean {
      const result = processNewEvents(jsonlPath, currentOffset, specPath, specLines, reviewPath)
      if (result) {
        currentOffset = result.newOffset
        writeFileSync(offsetPath, String(currentOffset))
        console.log(result.output)

        cleanup()

        // Clean up lock/offset if approved
        if (result.output.includes("Review approved")) {
          try { unlinkSync(lockPath) } catch {}
          try { unlinkSync(offsetPath) } catch {}
        }

        resolvePromise()
        return true
      }
      return false
    }

    // Try immediately
    if (check()) return

    // If file doesn't exist yet, wait for it
    if (!existsSync(jsonlPath)) {
      const dirWatcher = fsWatch(dirname(jsonlPath), (_, filename) => {
        if (filename === basename(jsonlPath)) {
          dirWatcher.close()
          startWatching()
        }
      })
      return
    }

    startWatching()

    function startWatching() {
      try {
        watcher = fsWatch(jsonlPath, () => { check() })
      } catch {}

      // Polling fallback every 500ms
      pollInterval = setInterval(() => { check() }, 500)
    }
  })
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run tests**

Run: `bun test test/cli-watch.test.ts`
Expected: All pass.

- [ ] **Step 5: Run all tests**

Run: `bun test`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/cli/watch.ts test/cli-watch.test.ts
git commit -m "feat: add revspec watch subcommand with context output"
```

---

## Chunk 3: ReviewState Updates

### Task 9: Add unread tracking to ReviewState

**Files:**
- Modify: `src/state/review-state.ts`
- Modify: `test/state/review-state.test.ts`

- [ ] **Step 1: Write failing tests for unread tracking**

Add to `test/state/review-state.test.ts`:
```typescript
describe("unread tracking", () => {
  it("tracks unread owner replies", () => {
    const state = new ReviewState(["line1", "line2"], [])
    state.addComment(1, "fix this")
    state.addOwnerReply("t1", "done", 1001)
    expect(state.unreadCount()).toBe(1)
  })

  it("markRead clears unread for a thread", () => {
    const state = new ReviewState(["line1"], [])
    state.addComment(1, "fix")
    state.addOwnerReply("t1", "done", 1001)
    state.markRead("t1")
    expect(state.unreadCount()).toBe(0)
  })

  it("nextUnreadThread returns line of next unread thread", () => {
    const state = new ReviewState(["a", "b", "c", "d", "e"], [])
    state.addComment(2, "fix")
    state.addComment(4, "fix too")
    state.addOwnerReply("t1", "done", 1001)
    state.addOwnerReply("t2", "done", 1002)
    state.cursorLine = 1
    expect(state.nextUnreadThread()).toBe(2)
  })

  it("prevUnreadThread returns line of prev unread thread", () => {
    const state = new ReviewState(["a", "b", "c", "d", "e"], [])
    state.addComment(2, "fix")
    state.addComment(4, "fix too")
    state.addOwnerReply("t1", "done", 1001)
    state.addOwnerReply("t2", "done", 1002)
    state.cursorLine = 5
    expect(state.prevUnreadThread()).toBe(4)
  })

  it("nextUnreadThread returns null when no unread", () => {
    const state = new ReviewState(["a"], [])
    expect(state.nextUnreadThread()).toBeNull()
  })

  it("isThreadUnread returns correct state", () => {
    const state = new ReviewState(["a"], [])
    state.addComment(1, "fix")
    expect(state.isThreadUnread("t1")).toBe(false)
    state.addOwnerReply("t1", "done", 1001)
    expect(state.isThreadUnread("t1")).toBe(true)
    state.markRead("t1")
    expect(state.isThreadUnread("t1")).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/state/review-state.test.ts`
Expected: FAIL — methods not found

- [ ] **Step 3: Implement unread tracking**

In `src/state/review-state.ts`, add:

```typescript
// New property
private unreadThreadIds: Set<string> = new Set()

// New methods
addOwnerReply(threadId: string, text: string, ts?: number): void {
  const thread = this.threads.find((t) => t.id === threadId)
  if (!thread) return
  const msg: Message = { author: "owner", text }
  if (ts !== undefined) msg.ts = ts
  thread.messages.push(msg)
  thread.status = "pending"
  this.unreadThreadIds.add(threadId)
}

unreadCount(): number {
  return this.unreadThreadIds.size
}

isThreadUnread(threadId: string): boolean {
  return this.unreadThreadIds.has(threadId)
}

markRead(threadId: string): void {
  this.unreadThreadIds.delete(threadId)
}

nextUnreadThread(): number | null {
  const unreadThreads = this.threads.filter((t) => this.unreadThreadIds.has(t.id))
  // Find first unread after cursor, wrapping
  const after = unreadThreads.find((t) => t.line > this.cursorLine)
  if (after) return after.line
  return unreadThreads.length > 0 ? unreadThreads[0].line : null
}

prevUnreadThread(): number | null {
  const unreadThreads = this.threads.filter((t) => this.unreadThreadIds.has(t.id))
  // Find last unread before cursor, wrapping
  const before = [...unreadThreads].reverse().find((t) => t.line < this.cursorLine)
  if (before) return before.line
  return unreadThreads.length > 0 ? unreadThreads[unreadThreads.length - 1].line : null
}
```

Also update existing `addComment` to use `"reviewer"` as author, and `replyToThread` to use the passed author or default `"reviewer"`.

- [ ] **Step 4: Run tests**

Run: `bun test test/state/review-state.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/state/review-state.ts test/state/review-state.test.ts
git commit -m "feat: add unread tracking to ReviewState"
```

---

## Chunk 4: TUI Integration

### Task 10: TUI writes to JSONL and watches for owner replies

**Files:**
- Create: `src/tui/live-watcher.ts`
- Modify: `src/tui/app.ts`

- [ ] **Step 1: Create live-watcher module**

Create `src/tui/live-watcher.ts`:
```typescript
import { watch, existsSync, statSync } from "fs"
import { readEventsFromOffset, type LiveEvent } from "../protocol/live-events"

export interface LiveWatcher {
  start(): void
  stop(): void
}

export function createLiveWatcher(
  jsonlPath: string,
  onOwnerEvents: (events: LiveEvent[]) => void
): LiveWatcher {
  let offset = existsSync(jsonlPath) ? statSync(jsonlPath).size : 0
  let fsWatcher: ReturnType<typeof watch> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null

  function check() {
    const { events, newOffset } = readEventsFromOffset(jsonlPath, offset)
    if (events.length > 0) {
      offset = newOffset
      const ownerEvents = events.filter((e) => e.author === "owner")
      if (ownerEvents.length > 0) {
        onOwnerEvents(ownerEvents)
      }
    }
  }

  return {
    start() {
      try {
        fsWatcher = watch(jsonlPath, () => check())
      } catch {}
      // Polling fallback
      pollTimer = setInterval(check, 500)
    },
    stop() {
      if (fsWatcher) { fsWatcher.close(); fsWatcher = null }
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
    },
  }
}
```

- [ ] **Step 2: Integrate into app.ts**

In `src/tui/app.ts`, modify `runTui`:

1. Derive `jsonlPath` from spec file path
2. On startup, create JSONL if not exists, replay events for crash recovery
3. Create `LiveWatcher`, pass callback that calls `state.addOwnerReply()` and `refreshPager()`
4. Replace `saveDraft()` calls with JSONL append calls (`appendEvent`)
5. On comment: `appendEvent(jsonlPath, { type: "comment", ... })`
6. On reply: `appendEvent(jsonlPath, { type: "reply", author: "reviewer", ... })`
7. On resolve: `appendEvent(jsonlPath, { type: "resolve", ... })`
8. On unresolve: add unresolve event
9. On delete (dd): `appendEvent(jsonlPath, { type: "delete", ... })`
10. On approve: `appendEvent(jsonlPath, { type: "approve", ... })`
11. On `:q` / `:wq`: merge JSONL → JSON via `mergeJsonlIntoReview`, write review file
12. On `:q!`: exit without merge
13. Start watcher on init, stop on exit

- [ ] **Step 3: Add `]r`/`[r` keybindings**

In the bracket-pending handler in `app.ts`, add:
```typescript
if (bracketPending === "]" && key === "r") {
  bracketPending = null
  const nextLine = state.nextUnreadThread()
  if (nextLine !== null) {
    state.cursorLine = nextLine
    ensureCursorVisible()
    refreshPager()
  }
  return
}
if (bracketPending === "[" && key === "r") {
  bracketPending = null
  const prevLine = state.prevUnreadThread()
  if (prevLine !== null) {
    state.cursorLine = prevLine
    ensureCursorVisible()
    refreshPager()
  }
  return
}
```

- [ ] **Step 4: Mark thread as read when viewing**

In `showCommentInput`, after opening the overlay for an existing thread, call `state.markRead(thread.id)`.

- [ ] **Step 5: Run all tests**

Run: `bun test`
Expected: All pass (TUI changes are not unit-testable, but no regressions).

- [ ] **Step 6: Commit**

```bash
git add src/tui/live-watcher.ts src/tui/app.ts
git commit -m "feat: TUI writes to JSONL, watches for owner replies, ]r/[r navigation"
```

---

### Task 11: Unread indicators in pager and status bar

**Files:**
- Modify: `src/tui/pager.ts`
- Modify: `src/tui/status-bar.ts`
- Modify: `src/tui/comment-input.ts`

- [ ] **Step 1: Pass unread state to pager**

In `src/tui/pager.ts`, update `buildPagerContent` to accept unread thread IDs and show a distinct indicator (`[+]` or different icon) for threads with unread replies.

- [ ] **Step 2: Update status bar to show unread count**

In `src/tui/status-bar.ts`, update `buildTopBarText` to include unread count:
```
spec.md  |  Threads: 1 open, 2 resolved | 2 new replies
```

Pass `unreadCount` as a parameter.

- [ ] **Step 3: Add timestamp display in comment-input**

In `src/tui/comment-input.ts`, when rendering thread history, format `msg.ts` as ISO time string if present:
```typescript
const tsStr = msg.ts ? new Date(msg.ts).toISOString().replace("T", " ").slice(0, 19) : ""
const label = msg.author === "reviewer" ? "You" : " AI"
// Render: "You [2026-03-14 15:30:05]: message text"
```

- [ ] **Step 4: Run all tests**

Run: `bun test`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/tui/pager.ts src/tui/status-bar.ts src/tui/comment-input.ts
git commit -m "feat: unread indicators, reply count in status bar, timestamp display"
```

---

### Task 11.5: Spec file mutation guard

**Files:**
- Modify: `src/tui/app.ts`

- [ ] **Step 1: Record spec mtime on startup**

In `runTui`, after reading the spec file, record `statSync(specFile).mtimeMs`.

- [ ] **Step 2: Check mtime on each pager refresh**

In `refreshPager`, check if spec mtime has changed. If so, show warning in status bar: `"Spec file changed externally — line anchors may be stale"`.

- [ ] **Step 3: Commit**

```bash
git add src/tui/app.ts
git commit -m "feat: add spec file mutation guard warning"
```

---

### Task 11.6: Clean up lock/offset files on TUI exit

**Files:**
- Modify: `src/tui/app.ts`

- [ ] **Step 1: On `:q` / `a` exit, clean up offset file**

After merging JSONL → JSON on exit, delete the offset file (`spec.review.live.offset`). The lock file is managed by the `watch` process, not the TUI.

- [ ] **Step 2: Commit**

```bash
git add src/tui/app.ts
git commit -m "feat: clean up offset file on TUI exit"
```

---

### Task 11.7: Add missing tests for lock file and crash recovery

**Files:**
- Modify: `test/cli-watch.test.ts`

- [ ] **Step 1: Add lock file enforcement test**

```typescript
it("exits 3 when another watch is running (lock file with live PID)", async () => {
  const lockPath = join(dir, "spec.review.live.lock")
  writeFileSync(lockPath, String(process.pid)) // current process is alive
  appendEvent(jsonlPath, { type: "comment", threadId: "t1", line: 1, author: "reviewer", text: "x", ts: 1 })

  const proc = Bun.spawn(["bun", "run", CLI, "watch", specPath], {
    stdout: "pipe", stderr: "pipe",
    env: { ...process.env, REVSPEC_WATCH_NO_BLOCK: "1" },
  })
  await proc.exited
  expect(proc.exitCode).toBe(3)
})

it("proceeds when lock file has dead PID", async () => {
  const lockPath = join(dir, "spec.review.live.lock")
  writeFileSync(lockPath, "999999") // almost certainly dead
  appendEvent(jsonlPath, { type: "comment", threadId: "t1", line: 1, author: "reviewer", text: "x", ts: 1 })

  const proc = Bun.spawn(["bun", "run", CLI, "watch", specPath], {
    stdout: "pipe", stderr: "pipe",
    env: { ...process.env, REVSPEC_WATCH_NO_BLOCK: "1" },
  })
  await proc.exited
  expect(proc.exitCode).toBe(0)
})
```

- [ ] **Step 2: Run tests**

Run: `bun test test/cli-watch.test.ts`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add test/cli-watch.test.ts
git commit -m "test: add lock file enforcement tests"
```

---

## Chunk 5: End-to-End Integration Test

### Task 12: E2E test — full watch/reply loop

**Files:**
- Create: `test/e2e-live.test.ts`

- [ ] **Step 1: Write E2E test**

Create `test/e2e-live.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { appendEvent, readEventsFromOffset } from "../src/protocol/live-events"
import { mergeJsonlIntoReview } from "../src/protocol/live-merge"
import { readReviewFile } from "../src/protocol/read"
import { writeReviewFile } from "../src/protocol/write"

const CLI = join(import.meta.dir, "..", "bin", "revspec.ts")

describe("E2E: live review loop", () => {
  let dir: string
  let specPath: string
  let jsonlPath: string
  let reviewPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "revspec-e2e-"))
    specPath = join(dir, "spec.md")
    jsonlPath = join(dir, "spec.review.live.jsonl")
    reviewPath = join(dir, "spec.review.json")
    writeFileSync(specPath, "# My Spec\n\nLine 3 is important.\n\nLine 5 also matters.\n")
  })

  afterEach(() => rmSync(dir, { recursive: true }))

  it("simulates full loop: comment → watch → reply → watch → resolve → approve", async () => {
    // Step 1: Reviewer adds comments (simulating TUI)
    appendEvent(jsonlPath, { type: "comment", threadId: "t1", line: 3, author: "reviewer", text: "this is unclear", ts: 1000 })
    appendEvent(jsonlPath, { type: "comment", threadId: "t2", line: 5, author: "reviewer", text: "needs more detail", ts: 1001 })

    // Step 2: AI runs watch, gets comments
    const watch1 = Bun.spawn(["bun", "run", CLI, "watch", specPath], {
      stdout: "pipe", stderr: "pipe",
      env: { ...process.env, REVSPEC_WATCH_NO_BLOCK: "1" },
    })
    const output1 = await new Response(watch1.stdout).text()
    await watch1.exited
    expect(watch1.exitCode).toBe(0)
    expect(output1).toContain("[t1]")
    expect(output1).toContain("[t2]")
    expect(output1).toContain("this is unclear")
    expect(output1).toContain("needs more detail")

    // Step 3: AI replies
    const reply1 = Bun.spawn(["bun", "run", CLI, "reply", specPath, "t1", "I'll restructure this section"], {
      stdout: "pipe", stderr: "pipe",
    })
    await reply1.exited
    expect(reply1.exitCode).toBe(0)

    const reply2 = Bun.spawn(["bun", "run", CLI, "reply", specPath, "t2", "Adding more context now"], {
      stdout: "pipe", stderr: "pipe",
    })
    await reply2.exited
    expect(reply2.exitCode).toBe(0)

    // Verify AI replies are in JSONL
    const { events } = readEventsFromOffset(jsonlPath, 0)
    expect(events).toHaveLength(4) // 2 comments + 2 replies
    expect(events[2].author).toBe("owner")
    expect(events[3].author).toBe("owner")

    // Step 4: Reviewer resolves and approves (simulating TUI)
    appendEvent(jsonlPath, { type: "resolve", threadId: "t1", author: "reviewer", ts: 2000 })
    appendEvent(jsonlPath, { type: "resolve", threadId: "t2", author: "reviewer", ts: 2001 })
    appendEvent(jsonlPath, { type: "approve", author: "reviewer", ts: 2002 })

    // Step 5: AI runs watch, gets approval
    const watch2 = Bun.spawn(["bun", "run", CLI, "watch", specPath], {
      stdout: "pipe", stderr: "pipe",
      env: { ...process.env, REVSPEC_WATCH_NO_BLOCK: "1" },
    })
    const output2 = await new Response(watch2.stdout).text()
    await watch2.exited
    expect(watch2.exitCode).toBe(0)
    expect(output2).toContain("Review approved")

    // Step 6: Merge JSONL → JSON (simulating TUI exit)
    const review = mergeJsonlIntoReview(jsonlPath, null, specPath)
    writeReviewFile(reviewPath, review)
    expect(review.threads).toHaveLength(2)
    expect(review.threads[0].status).toBe("resolved")
    expect(review.threads[1].status).toBe("resolved")
    expect(review.threads[0].messages).toHaveLength(2) // comment + reply
    expect(review.threads[1].messages).toHaveLength(2)

    // Timestamps preserved
    expect(review.threads[0].messages[0].ts).toBe(1000)
  })

  it("handles delete event in the loop", async () => {
    appendEvent(jsonlPath, { type: "comment", threadId: "t1", line: 3, author: "reviewer", text: "wrong comment", ts: 1000 })
    appendEvent(jsonlPath, { type: "delete", threadId: "t1", author: "reviewer", ts: 1001 })

    // Watch should show delete
    const proc = Bun.spawn(["bun", "run", CLI, "watch", specPath], {
      stdout: "pipe", stderr: "pipe",
      env: { ...process.env, REVSPEC_WATCH_NO_BLOCK: "1" },
    })
    const output = await new Response(proc.stdout).text()
    await proc.exited
    expect(output).toContain("Deleted")
    expect(output).toContain("retracted")

    // Merge should exclude empty thread
    const review = mergeJsonlIntoReview(jsonlPath, null, specPath)
    expect(review.threads).toHaveLength(0)
  })

  it("merges with existing review from prior round", async () => {
    // Prior round left a resolved thread
    const priorReview = {
      file: specPath,
      threads: [{ id: "t1", line: 3, status: "resolved" as const, messages: [
        { author: "reviewer" as const, text: "old comment" },
        { author: "owner" as const, text: "fixed" },
      ]}],
    }
    writeReviewFile(reviewPath, priorReview)

    // New round
    appendEvent(jsonlPath, { type: "round", author: "reviewer", round: 2, ts: 3000 })
    appendEvent(jsonlPath, { type: "comment", threadId: "t2", line: 5, author: "reviewer", text: "new issue", ts: 3001 })

    const review = mergeJsonlIntoReview(jsonlPath, priorReview, specPath)
    expect(review.threads).toHaveLength(2)
    expect(review.threads[0].id).toBe("t1") // prior preserved
    expect(review.threads[1].id).toBe("t2") // new added
  })
})
```

- [ ] **Step 2: Run E2E tests**

Run: `bun test test/e2e-live.test.ts`
Expected: All pass.

- [ ] **Step 3: Run full test suite**

Run: `bun test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add test/e2e-live.test.ts
git commit -m "test: add end-to-end live review loop tests"
```

---

## Chunk 6: CLI Entry Point Update

### Task 13: Update main CLI to use JSONL merge on exit

**Files:**
- Modify: `bin/revspec.ts`

- [ ] **Step 1: Update post-TUI processing**

In `bin/revspec.ts`, update the post-TUI processing (lines 73-106) to:
1. Check for JSONL file instead of draft file
2. If JSONL exists: use `mergeJsonlIntoReview` to merge into review JSON
3. If approved: output `APPROVED: <reviewPath>`
4. If has threads: output `<reviewPath>`
5. Remove draft file handling (replaced by JSONL)

The TUI now handles the merge on `:q` / `a` exit. The CLI post-processing just checks the result.

- [ ] **Step 2: Run all tests**

Run: `bun test`
Expected: All pass (including existing CLI tests, which may need updates for the new flow).

- [ ] **Step 3: Commit**

```bash
git add bin/revspec.ts
git commit -m "feat: update CLI entry point to use JSONL merge flow"
```

---

### Task 14: Manual smoke test

- [ ] **Step 1: Test the TUI flow**

```bash
# Create a test spec
echo "# Test Spec\n\nThis is line 3.\n\nThis is line 5.\n" > /tmp/test-spec.md

# Launch revspec
bun run bin/revspec.ts /tmp/test-spec.md
```

In the TUI:
1. Press `c` on line 3, type "this is unclear", press Tab — verify JSONL file created
2. Press `:q` to exit — verify `spec.review.json` created with the comment

- [ ] **Step 2: Test the watch/reply loop**

```bash
# Terminal 1: Launch revspec
bun run bin/revspec.ts /tmp/test-spec.md

# Terminal 2: Watch for comments
bun run bin/revspec.ts watch /tmp/test-spec.md

# Terminal 1: Add a comment in the TUI
# Terminal 2: Verify watch returns the comment

# Terminal 2: Reply
bun run bin/revspec.ts reply /tmp/test-spec.md t1 "I'll fix this"

# Terminal 1: Verify the reply appears in the TUI (unread indicator, status bar)
# Terminal 1: Press ]r to jump to unread, press c to view thread with timestamp
```

- [ ] **Step 3: Commit any fixes from smoke testing**
