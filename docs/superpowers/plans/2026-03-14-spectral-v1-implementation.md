# Spectral v1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI + TUI pager that lets humans review AI-generated spec documents by adding line-anchored comments, outputting structured JSON for AI consumption.

**Architecture:** A Bun-based CLI entry point that manages the review file lifecycle (draft/merge/approve), rendering a full-screen TUI pager built with OpenTUI. The TUI displays the spec with line numbers, thread status indicators, and inline comment hints. The JSON protocol defines threads with `open`/`pending`/`resolved`/`outdated` statuses.

**Tech Stack:** Bun, TypeScript, @opentui/core

**Spec:** `docs/superpowers/specs/2026-03-14-spec-review-tool-design.md`

---

## File Structure

```
spectral/
├── package.json
├── tsconfig.json
├── bunfig.toml
├── bin/
│   └── spectral.ts              # CLI entry point — arg parsing, file lifecycle, stdout output
├── src/
│   ├── protocol/
│   │   ├── types.ts             # ReviewFile, Thread, Message, Status types
│   │   ├── read.ts              # Read and validate review/draft JSON files
│   │   ├── write.ts             # Write review/draft JSON files
│   │   └── merge.ts             # Merge draft threads into review file
│   ├── tui/
│   │   ├── app.ts               # Top-level TUI app — creates renderer, manages state
│   │   ├── pager.ts             # Scrollable spec view with line numbers + thread indicators
│   │   ├── thread-expand.ts     # Thread expand overlay (shows full thread messages)
│   │   ├── comment-input.ts     # Inline text input for new comments / replies
│   │   ├── thread-list.ts       # List all open/pending threads (jump-to)
│   │   ├── search.ts            # / search overlay
│   │   ├── status-bar.ts        # Top bar (filename, thread counts) + bottom bar (keybinding hints)
│   │   └── confirm.ts           # Confirmation dialog (:q submit confirmation)
│   └── state/
│       ├── review-state.ts      # Central state: spec lines, threads, draft changes, cursor position
├── test/
│   ├── protocol/
│   │   ├── types.test.ts
│   │   ├── read.test.ts
│   │   ├── write.test.ts
│   │   └── merge.test.ts
│   ├── state/
│   │   └── review-state.test.ts
│   ├── tui/
│   │   └── pager.test.ts           # Tests for buildPagerContent (pure function)
│   └── cli.test.ts              # Integration test: CLI arg parsing, file lifecycle, stdout
```

---

## Chunk 0: OpenTUI API Verification

### Task 0: Verify OpenTUI APIs

Before building the TUI, verify the APIs we depend on actually exist. OpenTUI is new and the docs may not match the shipped package.

- [ ] **Step 1: Install and verify imports**

```typescript
// test/opentui-smoke.test.ts
import { describe, expect, it } from "bun:test";

describe("OpenTUI API availability", () => {
  it("core imports exist", async () => {
    const core = await import("@opentui/core");
    expect(core.createCliRenderer).toBeDefined();
    expect(core.TextRenderable).toBeDefined();
    expect(core.BoxRenderable).toBeDefined();
    expect(core.ScrollBoxRenderable).toBeDefined();
    expect(core.InputRenderable).toBeDefined();
    expect(core.SelectRenderable).toBeDefined();
  });
});
```

Run: `bun test test/opentui-smoke.test.ts`

If any import fails, check the actual exports with `bun repl` and adapt the plan accordingly. This test should be run FIRST before writing any TUI code.

- [ ] **Step 2: Commit**

```bash
git add test/opentui-smoke.test.ts
git commit -m "test: verify OpenTUI API availability"
```

---

## Chunk 1: Project Setup + Protocol Layer

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `bunfig.toml`
- Create: `bin/spectral.ts`

- [ ] **Step 1: Initialize Bun project**

```bash
cd /Users/tuephan/repo/spectral
bun init -y
```

- [ ] **Step 2: Install OpenTUI**

```bash
bun add @opentui/core
```

- [ ] **Step 3: Update package.json**

Set the `bin` field and project metadata:

```json
{
  "name": "spectral",
  "version": "0.1.0",
  "description": "Review tool for AI-generated spec documents",
  "bin": {
    "spectral": "./bin/spectral.ts"
  },
  "scripts": {
    "start": "bun run bin/spectral.ts",
    "test": "bun test"
  },
  "dependencies": {
    "@opentui/core": "latest"
  }
}
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["bun-types"]
  },
  "include": ["src/**/*.ts", "bin/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 5: Create minimal CLI entry point**

```typescript
// bin/spectral.ts
#!/usr/bin/env bun

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log("Usage: spectral <file.md> [--tui|--nvim|--web]");
  process.exit(0);
}

const specFile = args.find((a) => !a.startsWith("--"));
if (!specFile) {
  console.error("Error: No spec file provided");
  process.exit(1);
}

console.log(`spectral: would review ${specFile}`);
```

- [ ] **Step 6: Verify it runs**

Run: `bun run bin/spectral.ts test.md`
Expected: `spectral: would review test.md`

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json bunfig.toml bin/spectral.ts bun.lock
git commit -m "feat: scaffold Bun project with OpenTUI dependency"
```

---

### Task 2: Protocol Types

**Files:**
- Create: `src/protocol/types.ts`
- Create: `test/protocol/types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/protocol/types.test.ts
import { describe, expect, it } from "bun:test";
import {
  type ReviewFile,
  type Thread,
  type Message,
  type Status,
  isValidStatus,
  isValidThread,
  isValidReviewFile,
} from "../src/protocol/types";

describe("Status", () => {
  it("validates known statuses", () => {
    expect(isValidStatus("open")).toBe(true);
    expect(isValidStatus("pending")).toBe(true);
    expect(isValidStatus("resolved")).toBe(true);
    expect(isValidStatus("outdated")).toBe(true);
  });

  it("rejects unknown statuses", () => {
    expect(isValidStatus("addressed")).toBe(false);
    expect(isValidStatus("")).toBe(false);
    expect(isValidStatus("OPEN")).toBe(false);
  });
});

describe("isValidThread", () => {
  it("validates a minimal thread", () => {
    const thread: Thread = {
      id: "1",
      line: 12,
      status: "open",
      messages: [{ author: "human", text: "fix this" }],
    };
    expect(isValidThread(thread)).toBe(true);
  });

  it("rejects thread without line", () => {
    expect(isValidThread({ id: "1", status: "open", messages: [] })).toBe(false);
  });

  it("rejects thread without messages", () => {
    expect(isValidThread({ id: "1", line: 1, status: "open" })).toBe(false);
  });

  it("rejects thread with invalid status", () => {
    expect(
      isValidThread({ id: "1", line: 1, status: "bad", messages: [] })
    ).toBe(false);
  });
});

describe("isValidReviewFile", () => {
  it("validates a review file", () => {
    const review: ReviewFile = {
      file: "spec.md",
      threads: [
        {
          id: "1",
          line: 1,
          status: "open",
          messages: [{ author: "human", text: "comment" }],
        },
      ],
    };
    expect(isValidReviewFile(review)).toBe(true);
  });

  it("validates empty threads", () => {
    expect(isValidReviewFile({ file: "spec.md", threads: [] })).toBe(true);
  });

  it("rejects missing file field", () => {
    expect(isValidReviewFile({ threads: [] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/protocol/types.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/protocol/types.ts

export type Status = "open" | "pending" | "resolved" | "outdated";

export interface Message {
  author: "human" | "ai";
  text: string;
}

export interface Thread {
  id: string;
  line: number;
  status: Status;
  messages: Message[];
}

export interface ReviewFile {
  file: string;
  threads: Thread[];
}

// Draft can contain new threads or an approval signal
export interface DraftFile {
  approved?: boolean;
  threads?: Thread[];
}

const VALID_STATUSES: Set<string> = new Set(["open", "pending", "resolved", "outdated"]);

export function isValidStatus(status: unknown): status is Status {
  return typeof status === "string" && VALID_STATUSES.has(status);
}

export function isValidThread(obj: unknown): obj is Thread {
  if (typeof obj !== "object" || obj === null) return false;
  const t = obj as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.line === "number" &&
    Number.isInteger(t.line) &&
    t.line >= 1 &&
    isValidStatus(t.status) &&
    Array.isArray(t.messages)
  );
}

export function isValidReviewFile(obj: unknown): obj is ReviewFile {
  if (typeof obj !== "object" || obj === null) return false;
  const r = obj as Record<string, unknown>;
  return (
    typeof r.file === "string" &&
    Array.isArray(r.threads) &&
    (r.threads as unknown[]).every(isValidThread)
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/protocol/types.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/protocol/types.ts test/protocol/types.test.ts
git commit -m "feat: add protocol types with validation"
```

---

### Task 3: Protocol Read/Write

**Files:**
- Create: `src/protocol/read.ts`
- Create: `src/protocol/write.ts`
- Create: `test/protocol/read.test.ts`
- Create: `test/protocol/write.test.ts`

- [ ] **Step 1: Write failing tests for read**

```typescript
// test/protocol/read.test.ts
import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { readReviewFile, readDraftFile } from "../src/protocol/read";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("readReviewFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "spectral-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it("returns null for missing file", () => {
    expect(readReviewFile(join(dir, "missing.json"))).toBeNull();
  });

  it("reads a valid review file", () => {
    const path = join(dir, "review.json");
    const data = { file: "spec.md", threads: [] };
    writeFileSync(path, JSON.stringify(data));
    const result = readReviewFile(path);
    expect(result).toEqual(data);
  });

  it("returns null for invalid JSON", () => {
    const path = join(dir, "bad.json");
    writeFileSync(path, "not json{{{");
    expect(readReviewFile(path)).toBeNull();
  });

  it("returns null for valid JSON but invalid schema", () => {
    const path = join(dir, "bad-schema.json");
    writeFileSync(path, JSON.stringify({ bad: "data" }));
    expect(readReviewFile(path)).toBeNull();
  });
});

describe("readDraftFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "spectral-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it("returns null for missing file", () => {
    expect(readDraftFile(join(dir, "missing.json"))).toBeNull();
  });

  it("reads an approval draft", () => {
    const path = join(dir, "draft.json");
    writeFileSync(path, JSON.stringify({ approved: true }));
    const result = readDraftFile(path);
    expect(result).toEqual({ approved: true });
  });

  it("reads a draft with threads", () => {
    const path = join(dir, "draft.json");
    const data = {
      threads: [
        { id: "1", line: 5, status: "open", messages: [{ author: "human", text: "hi" }] },
      ],
    };
    writeFileSync(path, JSON.stringify(data));
    const result = readDraftFile(path);
    expect(result?.threads).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/protocol/read.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement read**

```typescript
// src/protocol/read.ts
import { existsSync, readFileSync } from "fs";
import { isValidReviewFile, type ReviewFile, type DraftFile } from "./types";

export function readReviewFile(path: string): ReviewFile | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    return isValidReviewFile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readDraftFile(path: string): DraftFile | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as DraftFile;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run read tests**

Run: `bun test test/protocol/read.test.ts`
Expected: All PASS

- [ ] **Step 5: Write failing tests for write**

```typescript
// test/protocol/write.test.ts
import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { writeReviewFile, writeDraftFile } from "../src/protocol/write";
import { readFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("writeReviewFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "spectral-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it("writes valid JSON", () => {
    const path = join(dir, "review.json");
    writeReviewFile(path, { file: "spec.md", threads: [] });
    const raw = readFileSync(path, "utf-8");
    expect(JSON.parse(raw)).toEqual({ file: "spec.md", threads: [] });
  });

  it("writes pretty-printed JSON", () => {
    const path = join(dir, "review.json");
    writeReviewFile(path, { file: "spec.md", threads: [] });
    const raw = readFileSync(path, "utf-8");
    expect(raw).toContain("\n");
  });
});

describe("writeDraftFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "spectral-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it("writes approval draft", () => {
    const path = join(dir, "draft.json");
    writeDraftFile(path, { approved: true });
    const raw = readFileSync(path, "utf-8");
    expect(JSON.parse(raw)).toEqual({ approved: true });
  });

  it("writes draft with threads", () => {
    const path = join(dir, "draft.json");
    const data = {
      threads: [
        { id: "1", line: 5, status: "open" as const, messages: [{ author: "human" as const, text: "hi" }] },
      ],
    };
    writeDraftFile(path, data);
    const raw = readFileSync(path, "utf-8");
    expect(JSON.parse(raw).threads).toHaveLength(1);
  });
});
```

- [ ] **Step 6: Run write tests to verify they fail**

Run: `bun test test/protocol/write.test.ts`
Expected: FAIL — module not found

- [ ] **Step 7: Implement write**

```typescript
// src/protocol/write.ts
import { writeFileSync } from "fs";
import type { ReviewFile, DraftFile } from "./types";

export function writeReviewFile(path: string, review: ReviewFile): void {
  writeFileSync(path, JSON.stringify(review, null, 2) + "\n");
}

export function writeDraftFile(path: string, draft: DraftFile): void {
  writeFileSync(path, JSON.stringify(draft, null, 2) + "\n");
}
```

- [ ] **Step 8: Run all write tests**

Run: `bun test test/protocol/write.test.ts`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
git add src/protocol/read.ts src/protocol/write.ts test/protocol/read.test.ts test/protocol/write.test.ts
git commit -m "feat: add protocol read/write with validation"
```

---

### Task 4: Protocol Merge

**Files:**
- Create: `src/protocol/merge.ts`
- Create: `test/protocol/merge.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// test/protocol/merge.test.ts
import { describe, expect, it } from "bun:test";
import { mergeDraftIntoReview } from "../src/protocol/merge";
import type { ReviewFile, DraftFile } from "../src/protocol/types";

describe("mergeDraftIntoReview", () => {
  it("adds new threads from draft to empty review", () => {
    const review: ReviewFile = { file: "spec.md", threads: [] };
    const draft: DraftFile = {
      threads: [
        { id: "1", line: 5, status: "open", messages: [{ author: "human", text: "fix" }] },
      ],
    };
    const result = mergeDraftIntoReview(review, draft);
    expect(result.threads).toHaveLength(1);
    expect(result.threads[0].id).toBe("1");
  });

  it("appends messages to existing thread", () => {
    const review: ReviewFile = {
      file: "spec.md",
      threads: [
        {
          id: "1",
          line: 5,
          status: "pending",
          messages: [
            { author: "human", text: "fix" },
            { author: "ai", text: "done" },
          ],
        },
      ],
    };
    const draft: DraftFile = {
      threads: [
        {
          id: "1",
          line: 5,
          status: "open",
          messages: [
            { author: "human", text: "fix" },
            { author: "ai", text: "done" },
            { author: "human", text: "not quite, try again" },
          ],
        },
      ],
    };
    const result = mergeDraftIntoReview(review, draft);
    expect(result.threads).toHaveLength(1);
    expect(result.threads[0].messages).toHaveLength(3);
    expect(result.threads[0].status).toBe("open");
  });

  it("handles mix of new and existing threads", () => {
    const review: ReviewFile = {
      file: "spec.md",
      threads: [
        { id: "1", line: 5, status: "resolved", messages: [{ author: "human", text: "ok" }] },
      ],
    };
    const draft: DraftFile = {
      threads: [
        { id: "2", line: 10, status: "open", messages: [{ author: "human", text: "new" }] },
      ],
    };
    const result = mergeDraftIntoReview(review, draft);
    expect(result.threads).toHaveLength(2);
  });

  it("returns review unchanged if draft has no threads", () => {
    const review: ReviewFile = { file: "spec.md", threads: [] };
    const draft: DraftFile = {};
    const result = mergeDraftIntoReview(review, draft);
    expect(result.threads).toHaveLength(0);
  });

  it("creates new review if none exists", () => {
    const draft: DraftFile = {
      threads: [
        { id: "1", line: 1, status: "open", messages: [{ author: "human", text: "hi" }] },
      ],
    };
    const result = mergeDraftIntoReview(null, draft, "spec.md");
    expect(result.threads).toHaveLength(1);
    expect(result.file).toBe("spec.md");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/protocol/merge.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement merge**

```typescript
// src/protocol/merge.ts
import type { ReviewFile, DraftFile } from "./types";

export function mergeDraftIntoReview(
  review: ReviewFile | null,
  draft: DraftFile,
  specFile: string = ""
): ReviewFile {
  const base: ReviewFile = review ?? { file: specFile, threads: [] };

  if (!draft.threads || draft.threads.length === 0) {
    return base;
  }

  const threadMap = new Map(base.threads.map((t) => [t.id, t]));

  for (const draftThread of draft.threads) {
    const existing = threadMap.get(draftThread.id);
    if (existing) {
      // Append only new messages (draft contains full thread history)
      const newMessages = draftThread.messages.slice(existing.messages.length);
      existing.messages.push(...newMessages);
      existing.status = draftThread.status;
    } else {
      threadMap.set(draftThread.id, { ...draftThread });
    }
  }

  return {
    file: base.file,
    threads: Array.from(threadMap.values()),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `bun test test/protocol/merge.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/protocol/merge.ts test/protocol/merge.test.ts
git commit -m "feat: add draft-to-review merge logic"
```

---

## Chunk 2: CLI Entry Point

### Task 5: CLI Argument Parsing + File Lifecycle

**Files:**
- Modify: `bin/spectral.ts`
- Create: `test/cli.test.ts`

- [ ] **Step 1: Write failing integration tests**

```typescript
// test/cli.test.ts
import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("CLI", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "spectral-cli-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it("exits 1 for missing spec file", async () => {
    const proc = Bun.spawn(["bun", "run", "bin/spectral.ts", join(dir, "missing.md")], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, SPECTRAL_SKIP_TUI: "1" },
    });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
  });

  it("exits 0 with no output when no review file exists", async () => {
    const specPath = join(dir, "spec.md");
    writeFileSync(specPath, "# Test Spec\n");
    const proc = Bun.spawn(["bun", "run", "bin/spectral.ts", specPath], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, SPECTRAL_SKIP_TUI: "1" },
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("");
  });

  it("outputs APPROVED when draft has approved flag", async () => {
    const specPath = join(dir, "spec.md");
    const reviewPath = join(dir, "spec.review.json");
    const draftPath = join(dir, "spec.review.draft.json");
    writeFileSync(specPath, "# Test Spec\n");
    writeFileSync(reviewPath, JSON.stringify({ file: specPath, threads: [] }));
    writeFileSync(draftPath, JSON.stringify({ approved: true }));
    const proc = Bun.spawn(["bun", "run", "bin/spectral.ts", specPath], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, SPECTRAL_SKIP_TUI: "1" },
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toStartWith("APPROVED:");
  });

  it("merges draft into review file", async () => {
    const specPath = join(dir, "spec.md");
    const reviewPath = join(dir, "spec.review.json");
    const draftPath = join(dir, "spec.review.draft.json");
    writeFileSync(specPath, "# Test Spec\n");
    writeFileSync(reviewPath, JSON.stringify({ file: specPath, threads: [] }));
    writeFileSync(
      draftPath,
      JSON.stringify({
        threads: [{ id: "1", line: 1, status: "open", messages: [{ author: "human", text: "hi" }] }],
      })
    );
    const proc = Bun.spawn(["bun", "run", "bin/spectral.ts", specPath], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, SPECTRAL_SKIP_TUI: "1" },
    });
    await proc.exited;
    expect(existsSync(draftPath)).toBe(false);
    const review = JSON.parse(readFileSync(reviewPath, "utf-8"));
    expect(review.threads).toHaveLength(1);
  });

  it("warns and deletes corrupted draft file", async () => {
    const specPath = join(dir, "spec.md");
    const draftPath = join(dir, "spec.review.draft.json");
    writeFileSync(specPath, "# Test Spec\n");
    writeFileSync(draftPath, "not valid json{{{");
    const proc = Bun.spawn(["bun", "run", "bin/spectral.ts", specPath], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, SPECTRAL_SKIP_TUI: "1" },
    });
    await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(stderr).toContain("corrupted");
    expect(existsSync(draftPath)).toBe(false);
  });

  it("prints nothing when human adds no comments (no prior review)", async () => {
    const specPath = join(dir, "spec.md");
    writeFileSync(specPath, "# Test Spec\n");
    const proc = Bun.spawn(["bun", "run", "bin/spectral.ts", specPath], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, SPECTRAL_SKIP_TUI: "1" },
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/cli.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the full CLI**

```typescript
// bin/spectral.ts
#!/usr/bin/env bun
import { existsSync, unlinkSync } from "fs";
import { resolve, dirname, basename } from "path";
import { readReviewFile, readDraftFile } from "../src/protocol/read";
import { writeReviewFile } from "../src/protocol/write";
import { mergeDraftIntoReview } from "../src/protocol/merge";

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log("Usage: spectral <file.md> [--tui|--nvim|--web]");
  process.exit(0);
}

const specFile = resolve(args.find((a) => !a.startsWith("--"))!);

// Step 1: Validate spec file
if (!existsSync(specFile)) {
  console.error(`Error: File not found: ${specFile}`);
  process.exit(1);
}

// Derive paths
const dir = dirname(specFile);
const base = basename(specFile, ".md");
const reviewPath = resolve(dir, `${base}.review.json`);
const draftPath = resolve(dir, `${base}.review.draft.json`);

// Step 2: Check for existing draft (resume or corrupted)
let existingDraft = readDraftFile(draftPath);
if (existsSync(draftPath) && existingDraft === null) {
  console.error("Warning: Draft file corrupted, starting fresh");
  unlinkSync(draftPath);
}

// Step 3: Launch TUI (unless SPECTRAL_SKIP_TUI is set for testing)
if (!process.env.SPECTRAL_SKIP_TUI) {
  // TUI will be implemented in Chunk 3
  const { runTui } = await import("../src/tui/app");
  await runTui(specFile, reviewPath, draftPath);
}

// Step 5: Read draft and process
const draft = readDraftFile(draftPath);

if (draft?.approved) {
  // Approval — clean up draft, output APPROVED
  if (existsSync(draftPath)) unlinkSync(draftPath);
  console.log(`APPROVED: ${reviewPath}`);
  process.exit(0);
}

let hasNewComments = false;
if (draft?.threads && draft.threads.length > 0) {
  // Merge draft into review
  const review = readReviewFile(reviewPath);
  const merged = mergeDraftIntoReview(review, draft, specFile);
  writeReviewFile(reviewPath, merged);
  if (existsSync(draftPath)) unlinkSync(draftPath);
  hasNewComments = true;
} else {
  if (existsSync(draftPath)) unlinkSync(draftPath);
}

// Step 6: Output — only print path if there are actionable threads
if (hasNewComments || (existsSync(reviewPath) && readReviewFile(reviewPath)?.threads.some(
  (t) => t.status === "open" || t.status === "pending"
))) {
  console.log(reviewPath);
}
// Otherwise: no output — human closed without commenting or all threads resolved

process.exit(0);
```

- [ ] **Step 4: Create a stub TUI module**

```typescript
// src/tui/app.ts
export async function runTui(
  specFile: string,
  reviewPath: string,
  draftPath: string
): Promise<void> {
  // Stub — will be implemented in Chunk 3
  console.log("TUI not yet implemented");
}
```

- [ ] **Step 5: Run CLI tests**

Run: `bun test test/cli.test.ts`
Expected: All PASS

- [ ] **Step 6: Run all tests**

Run: `bun test`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add bin/spectral.ts src/tui/app.ts test/cli.test.ts
git commit -m "feat: implement CLI entry point with file lifecycle"
```

---

## Chunk 3: TUI — State Management

### Task 6: Review State

**Files:**
- Create: `src/state/review-state.ts`
- Create: `test/state/review-state.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// test/state/review-state.test.ts
import { describe, expect, it } from "bun:test";
import { ReviewState } from "../src/state/review-state";

describe("ReviewState", () => {
  const specLines = ["# Title", "", "## Section", "Some content", "More content"];

  it("initializes with spec lines and no threads", () => {
    const state = new ReviewState(specLines, []);
    expect(state.lineCount).toBe(5);
    expect(state.threads).toHaveLength(0);
    expect(state.cursorLine).toBe(1);
  });

  it("adds a new thread", () => {
    const state = new ReviewState(specLines, []);
    state.addComment(3, "needs more detail");
    expect(state.threads).toHaveLength(1);
    expect(state.threads[0].line).toBe(3);
    expect(state.threads[0].status).toBe("open");
    expect(state.threads[0].messages[0].text).toBe("needs more detail");
  });

  it("replies to existing thread (flips to open)", () => {
    const state = new ReviewState(specLines, [
      {
        id: "1",
        line: 3,
        status: "pending",
        messages: [
          { author: "human", text: "fix" },
          { author: "ai", text: "done" },
        ],
      },
    ]);
    state.replyToThread("1", "not quite");
    expect(state.threads[0].messages).toHaveLength(3);
    expect(state.threads[0].status).toBe("open");
  });

  it("resolves a thread", () => {
    const state = new ReviewState(specLines, [
      { id: "1", line: 3, status: "pending", messages: [{ author: "human", text: "fix" }] },
    ]);
    state.resolveThread("1");
    expect(state.threads[0].status).toBe("resolved");
  });

  it("batch resolves all pending threads", () => {
    const state = new ReviewState(specLines, [
      { id: "1", line: 1, status: "pending", messages: [{ author: "human", text: "a" }] },
      { id: "2", line: 2, status: "pending", messages: [{ author: "human", text: "b" }] },
      { id: "3", line: 3, status: "open", messages: [{ author: "human", text: "c" }] },
    ]);
    state.resolveAllPending();
    expect(state.threads[0].status).toBe("resolved");
    expect(state.threads[1].status).toBe("resolved");
    expect(state.threads[2].status).toBe("open");
  });

  it("gets thread at line", () => {
    const state = new ReviewState(specLines, [
      { id: "1", line: 3, status: "open", messages: [{ author: "human", text: "hi" }] },
    ]);
    expect(state.threadAtLine(3)?.id).toBe("1");
    expect(state.threadAtLine(4)).toBeNull();
  });

  it("navigates to next/prev open thread", () => {
    const state = new ReviewState(specLines, [
      { id: "1", line: 1, status: "resolved", messages: [{ author: "human", text: "a" }] },
      { id: "2", line: 3, status: "open", messages: [{ author: "human", text: "b" }] },
      { id: "3", line: 5, status: "pending", messages: [{ author: "human", text: "c" }] },
    ]);
    state.cursorLine = 1;
    const next = state.nextActiveThread();
    expect(next).toBe(3);
    state.cursorLine = 3;
    const next2 = state.nextActiveThread();
    expect(next2).toBe(5);
  });

  it("canApprove returns true when all resolved/outdated", () => {
    const state = new ReviewState(specLines, [
      { id: "1", line: 1, status: "resolved", messages: [{ author: "human", text: "a" }] },
      { id: "2", line: 3, status: "outdated", messages: [{ author: "human", text: "b" }] },
    ]);
    expect(state.canApprove()).toBe(true);
  });

  it("canApprove returns false with open threads", () => {
    const state = new ReviewState(specLines, [
      { id: "1", line: 1, status: "open", messages: [{ author: "human", text: "a" }] },
    ]);
    expect(state.canApprove()).toBe(false);
  });

  it("canApprove returns false with no threads (prevents empty approval)", () => {
    const state = new ReviewState(specLines, []);
    expect(state.canApprove()).toBe(false);
  });

  it("generates next thread id", () => {
    const state = new ReviewState(specLines, [
      { id: "3", line: 1, status: "open", messages: [{ author: "human", text: "a" }] },
    ]);
    expect(state.nextThreadId()).toBe("4");
  });

  it("deletes most recent human draft message", () => {
    const state = new ReviewState(specLines, []);
    state.addComment(3, "first");
    state.deleteLastDraftMessage("1");
    expect(state.threads).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/state/review-state.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement ReviewState**

```typescript
// src/state/review-state.ts
import type { Thread, Message } from "../protocol/types";

export class ReviewState {
  specLines: string[];
  threads: Thread[];
  cursorLine: number = 1;
  private draftThreadIds: Set<string> = new Set();

  constructor(specLines: string[], threads: Thread[]) {
    this.specLines = specLines;
    this.threads = [...threads];
  }

  get lineCount(): number {
    return this.specLines.length;
  }

  nextThreadId(): string {
    const maxId = this.threads.reduce(
      (max, t) => Math.max(max, parseInt(t.id, 10) || 0),
      0
    );
    return String(maxId + 1);
  }

  addComment(line: number, text: string): void {
    const id = this.nextThreadId();
    this.threads.push({
      id,
      line,
      status: "open",
      messages: [{ author: "human", text }],
    });
    this.draftThreadIds.add(id);
  }

  replyToThread(threadId: string, text: string): void {
    const thread = this.threads.find((t) => t.id === threadId);
    if (!thread) return;
    thread.messages.push({ author: "human", text });
    thread.status = "open";
  }

  resolveThread(threadId: string): void {
    const thread = this.threads.find((t) => t.id === threadId);
    if (!thread) return;
    thread.status = "resolved";
  }

  resolveAllPending(): void {
    for (const thread of this.threads) {
      if (thread.status === "pending") {
        thread.status = "resolved";
      }
    }
  }

  threadAtLine(line: number): Thread | null {
    return this.threads.find((t) => t.line === line) ?? null;
  }

  nextActiveThread(): number | null {
    const active = this.threads
      .filter((t) => t.status === "open" || t.status === "pending")
      .sort((a, b) => a.line - b.line);
    const next = active.find((t) => t.line > this.cursorLine);
    return next?.line ?? active[0]?.line ?? null;
  }

  prevActiveThread(): number | null {
    const active = this.threads
      .filter((t) => t.status === "open" || t.status === "pending")
      .sort((a, b) => b.line - a.line);
    const prev = active.find((t) => t.line < this.cursorLine);
    return prev?.line ?? active[0]?.line ?? null;
  }

  canApprove(): boolean {
    // Must have at least one thread to approve (prevents approving without review)
    if (this.threads.length === 0) return false;
    return this.threads.every(
      (t) => t.status === "resolved" || t.status === "outdated"
    );
  }

  activeThreadCount(): { open: number; pending: number } {
    let open = 0;
    let pending = 0;
    for (const t of this.threads) {
      if (t.status === "open") open++;
      if (t.status === "pending") pending++;
    }
    return { open, pending };
  }

  deleteLastDraftMessage(threadId: string): void {
    const thread = this.threads.find((t) => t.id === threadId);
    if (!thread) return;
    // Remove last human message
    for (let i = thread.messages.length - 1; i >= 0; i--) {
      if (thread.messages[i].author === "human") {
        thread.messages.splice(i, 1);
        break;
      }
    }
    // If no messages left, remove the thread
    if (thread.messages.length === 0) {
      this.threads = this.threads.filter((t) => t.id !== threadId);
    }
  }

  toDraft(): { threads: Thread[] } {
    return { threads: this.threads };
  }
}
```

- [ ] **Step 4: Run tests**

Run: `bun test test/state/review-state.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/state/review-state.ts test/state/review-state.test.ts
git commit -m "feat: add ReviewState with thread management"
```

---

## Chunk 4: TUI — Rendering + Interaction

### Task 7: TUI App Shell

**Files:**
- Modify: `src/tui/app.ts`
- Create: `src/tui/pager.ts`
- Create: `src/tui/status-bar.ts`

- [ ] **Step 1: Implement the pager view**

```typescript
// src/tui/pager.ts
import { type CliRenderer, BoxRenderable, TextRenderable, ScrollBoxRenderable } from "@opentui/core";
import type { ReviewState } from "../state/review-state";

const STATUS_ICONS: Record<string, string> = {
  open: "💬",
  pending: "🔵",
  resolved: "✔",
  outdated: "⚠",
};

export function buildPagerContent(state: ReviewState): string {
  const lines: string[] = [];
  for (let i = 0; i < state.specLines.length; i++) {
    const lineNum = i + 1;
    const numStr = String(lineNum).padStart(4, " ");
    const thread = state.threadAtLine(lineNum);
    const indicator = thread ? ` ${STATUS_ICONS[thread.status] ?? ""}` : "";
    const hint =
      thread && thread.messages.length > 0
        ? ` ${thread.messages[thread.messages.length - 1].text.slice(0, 40)}`
        : "";
    lines.push(`${numStr}  ${state.specLines[i]}${indicator}${hint}`);
  }
  return lines.join("\n");
}

export function createPager(
  renderer: CliRenderer,
  state: ReviewState
): ScrollBoxRenderable {
  const content = buildPagerContent(state);
  const scrollBox = new ScrollBoxRenderable(renderer, {
    id: "pager",
    width: "100%",
    flexGrow: 1,
    borderStyle: "single",
  });
  const text = new TextRenderable(renderer, {
    id: "pager-text",
    content,
    width: "100%",
  });
  scrollBox.add(text);
  return scrollBox;
}
```

- [ ] **Step 2: Implement the status bar**

```typescript
// src/tui/status-bar.ts
import { type CliRenderer, TextRenderable, BoxRenderable } from "@opentui/core";
import type { ReviewState } from "../state/review-state";

export function createTopBar(
  renderer: CliRenderer,
  specFile: string,
  state: ReviewState
): TextRenderable {
  const counts = state.activeThreadCount();
  const resolved = state.threads.filter((t) => t.status === "resolved").length;
  const summary = [
    counts.open > 0 ? `${counts.open} open` : null,
    counts.pending > 0 ? `${counts.pending} pending` : null,
    resolved > 0 ? `${resolved} resolved` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return new TextRenderable(renderer, {
    id: "top-bar",
    content: `${specFile}  [Review]  ${summary ? `Threads: ${summary}` : "No threads"}`,
    width: "100%",
    height: 1,
    fg: "#000000",
    bg: "#CCCCCC",
  });
}

export function createBottomBar(renderer: CliRenderer): TextRenderable {
  return new TextRenderable(renderer, {
    id: "bottom-bar",
    content: "j/k scroll  /search  c comment  e expand  r resolve  R resolve-all  a approve  :w save  :q submit  :q! quit",
    width: "100%",
    height: 1,
    fg: "#888888",
  });
}
```

- [ ] **Step 3: Implement the TUI app**

```typescript
// src/tui/app.ts
import { createCliRenderer, type KeyEvent } from "@opentui/core";
import { readFileSync } from "fs";
import { readReviewFile, readDraftFile } from "../protocol/read";
import { writeDraftFile } from "../protocol/write";
import { ReviewState } from "../state/review-state";
import { buildPagerContent, createPager } from "./pager";
import { createTopBar, createBottomBar } from "./status-bar";

export async function runTui(
  specFile: string,
  reviewPath: string,
  draftPath: string
): Promise<void> {
  // Load spec
  const specContent = readFileSync(specFile, "utf-8");
  const specLines = specContent.split("\n");

  // Load existing review + draft
  const review = readReviewFile(reviewPath);
  const draft = readDraftFile(draftPath);
  const threads = review?.threads ?? draft?.threads ?? [];

  // Create state
  const state = new ReviewState(specLines, threads);

  // Create renderer
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useAlternateScreen: true,
  });

  // Build UI
  const topBar = createTopBar(renderer, specFile, state);
  const pager = createPager(renderer, state);
  const bottomBar = createBottomBar(renderer);

  renderer.root.add(topBar);
  renderer.root.add(pager);
  renderer.root.add(bottomBar);

  // Track command mode for :w, :q, :q!
  let commandBuffer = "";

  // Keybinding handler
  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    // Command mode (:w, :q, :q!)
    if (commandBuffer.startsWith(":")) {
      commandBuffer += key.sequence ?? "";
      if (commandBuffer === ":w") {
        writeDraftFile(draftPath, state.toDraft());
        commandBuffer = "";
      } else if (commandBuffer === ":q!") {
        commandBuffer = "";
        renderer.destroy();
        return;
      } else if (commandBuffer === ":q") {
        writeDraftFile(draftPath, state.toDraft());
        commandBuffer = "";
        renderer.destroy();
        return;
      } else if (commandBuffer.length > 3) {
        commandBuffer = "";
      }
      return;
    }

    if (key.sequence === ":") {
      commandBuffer = ":";
      return;
    }

    // Navigation
    if (key.name === "j" || key.name === "down") {
      if (state.cursorLine < state.lineCount) state.cursorLine++;
    } else if (key.name === "k" || key.name === "up") {
      if (state.cursorLine > 1) state.cursorLine--;
    } else if (key.name === "space") {
      // Page down — move cursor by terminal height
      const pageSize = (renderer.root.height ?? 20) - 4; // minus bars
      state.cursorLine = Math.min(state.lineCount, state.cursorLine + pageSize);
    } else if (key.name === "b") {
      // Page up
      const pageSize = (renderer.root.height ?? 20) - 4;
      state.cursorLine = Math.max(1, state.cursorLine - pageSize);
    } else if (key.name === "n") {
      const next = state.nextActiveThread();
      if (next) state.cursorLine = next;
    } else if (key.name === "N") {
      const prev = state.prevActiveThread();
      if (prev) state.cursorLine = prev;
    }
    // Thread actions
    else if (key.name === "r") {
      const thread = state.threadAtLine(state.cursorLine);
      if (thread) state.resolveThread(thread.id);
    } else if (key.name === "R") {
      state.resolveAllPending();
    } else if (key.name === "d") {
      const thread = state.threadAtLine(state.cursorLine);
      if (thread) state.deleteLastDraftMessage(thread.id);
    } else if (key.name === "a") {
      if (state.canApprove()) {
        writeDraftFile(draftPath, { approved: true });
        renderer.destroy();
        return;
      }
    }

    // c (comment), e (expand), / (search), l (list)
    // Wired in Task 8 and Task 9 as overlay components

    // Re-render pager after any state change
    refreshPager(pager, topBar, state, specFile, renderer);
  });
}

// Re-render the pager content and status bar after state mutations
function refreshPager(
  pager: any, topBar: any, state: ReviewState,
  specFile: string, renderer: any
): void {
  // Rebuild pager text content
  const textNode = pager.children?.[0];
  if (textNode?.setContent) {
    textNode.setContent(buildPagerContent(state));
  }
  // Update status bar
  const counts = state.activeThreadCount();
  const resolved = state.threads.filter((t) => t.status === "resolved").length;
  const summary = [
    counts.open > 0 ? `${counts.open} open` : null,
    counts.pending > 0 ? `${counts.pending} pending` : null,
    resolved > 0 ? `${resolved} resolved` : null,
  ].filter(Boolean).join(", ");
  if (topBar.setContent) {
    topBar.setContent(`${specFile}  [Review]  ${summary ? `Threads: ${summary}` : "No threads"}`);
  }
}
```

- [ ] **Step 4: Write unit tests for buildPagerContent**

```typescript
// test/tui/pager.test.ts
import { describe, expect, it } from "bun:test";
import { buildPagerContent } from "../../src/tui/pager";
import { ReviewState } from "../../src/state/review-state";

describe("buildPagerContent", () => {
  it("renders lines with line numbers", () => {
    const state = new ReviewState(["# Title", "Content"], []);
    const output = buildPagerContent(state);
    expect(output).toContain("   1");
    expect(output).toContain("# Title");
    expect(output).toContain("   2");
  });

  it("shows status indicators for threads", () => {
    const state = new ReviewState(["line one", "line two", "line three"], [
      { id: "1", line: 2, status: "open", messages: [{ author: "human", text: "fix this" }] },
    ]);
    const output = buildPagerContent(state);
    expect(output).toContain("💬");
    expect(output).toContain("fix this");
  });

  it("shows different icons for different statuses", () => {
    const state = new ReviewState(["a", "b", "c", "d"], [
      { id: "1", line: 1, status: "resolved", messages: [{ author: "human", text: "ok" }] },
      { id: "2", line: 2, status: "pending", messages: [{ author: "ai", text: "done" }] },
      { id: "3", line: 3, status: "outdated", messages: [{ author: "human", text: "old" }] },
    ]);
    const output = buildPagerContent(state);
    expect(output).toContain("✔");
    expect(output).toContain("🔵");
    expect(output).toContain("⚠");
  });

  it("truncates long comment text", () => {
    const longText = "a".repeat(100);
    const state = new ReviewState(["line"], [
      { id: "1", line: 1, status: "open", messages: [{ author: "human", text: longText }] },
    ]);
    const output = buildPagerContent(state);
    expect(output.length).toBeLessThan(200);
  });
});
```

- [ ] **Step 5: Run pager tests**

Run: `bun test test/tui/pager.test.ts`
Expected: All PASS

- [ ] **Step 6: Run the app manually to verify**

Run: `bun run bin/spectral.ts docs/superpowers/specs/2026-03-14-spec-review-tool-design.md`
Expected: Full-screen TUI with spec content, line numbers, status bar

- [ ] **Step 7: Commit**

```bash
git add src/tui/app.ts src/tui/pager.ts src/tui/status-bar.ts test/tui/pager.test.ts
git commit -m "feat: implement TUI shell with pager, status bar, basic keybindings"
```

---

### Task 8: Comment Input Overlay

**Files:**
- Create: `src/tui/comment-input.ts`
- Modify: `src/tui/app.ts`

- [ ] **Step 1: Implement comment input overlay**

```typescript
// src/tui/comment-input.ts
import {
  type CliRenderer,
  BoxRenderable,
  TextRenderable,
  TextareaRenderable,
} from "@opentui/core";

interface CommentInputOptions {
  renderer: CliRenderer;
  line: number;
  existingThreadId?: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function showCommentInput(opts: CommentInputOptions): BoxRenderable {
  const { renderer, line, existingThreadId, onSubmit, onCancel } = opts;

  const container = new BoxRenderable(renderer, {
    id: "comment-input",
    width: "80%",
    height: 6,
    position: "absolute",
    left: "center",
    top: "center",
    borderStyle: "double",
    backgroundColor: "#1a1a2e",
    padding: 1,
    zIndex: 100,
    flexDirection: "column",
  });

  const label = new TextRenderable(renderer, {
    id: "comment-label",
    content: existingThreadId
      ? `Reply to thread #${existingThreadId} (line ${line})`
      : `New comment on line ${line}`,
    fg: "#CCCCCC",
    height: 1,
  });

  const input = new TextareaRenderable(renderer, {
    id: "comment-textarea",
    width: "100%",
    height: 3,
    flexGrow: 1,
    borderStyle: "single",
    focused: true,
  });

  const hint = new TextRenderable(renderer, {
    id: "comment-hint",
    content: "[Ctrl+Enter] submit  [Enter] newline  [Esc] cancel",
    fg: "#666666",
    height: 1,
  });

  container.add(label);
  container.add(input);
  container.add(hint);

  // Handle submit/cancel via key events on the input
  renderer.keyInput.on("keypress", function handleCommentKey(key) {
    if (key.name === "escape") {
      renderer.keyInput.off("keypress", handleCommentKey);
      onCancel();
    } else if (key.name === "return" && key.ctrl) {
      const text = input.getValue?.() ?? "";
      if (text.trim()) {
        renderer.keyInput.off("keypress", handleCommentKey);
        onSubmit(text.trim());
      }
    }
  });

  return container;
}
```

- [ ] **Step 2: Wire comment input into app.ts keybinding handler**

Add to the keybinding handler in `src/tui/app.ts`, in the `else if (key.name === "c")` block:

```typescript
else if (key.name === "c") {
  const existingThread = state.threadAtLine(state.cursorLine);
  const overlay = showCommentInput({
    renderer,
    line: state.cursorLine,
    existingThreadId: existingThread?.id,
    onSubmit: (text) => {
      if (existingThread) {
        state.replyToThread(existingThread.id, text);
      } else {
        state.addComment(state.cursorLine, text);
      }
      renderer.root.remove(overlay);
      // Refresh pager content
    },
    onCancel: () => {
      renderer.root.remove(overlay);
    },
  });
  renderer.root.add(overlay);
}
```

- [ ] **Step 3: Test manually**

Run: `bun run bin/spectral.ts docs/superpowers/specs/2026-03-14-spec-review-tool-design.md`
Press `c` on any line → comment input overlay appears
Type a comment → Ctrl+Enter → comment saved, overlay closes
Press Escape → overlay closes without saving

- [ ] **Step 4: Commit**

```bash
git add src/tui/comment-input.ts src/tui/app.ts
git commit -m "feat: add comment input overlay with Ctrl+Enter submit"
```

---

### Task 9: Thread Expand + Search + Thread List

**Files:**
- Create: `src/tui/thread-expand.ts`
- Create: `src/tui/search.ts`
- Create: `src/tui/thread-list.ts`
- Modify: `src/tui/app.ts`

- [ ] **Step 1: Implement thread expand**

```typescript
// src/tui/thread-expand.ts
import { type CliRenderer, BoxRenderable, TextRenderable } from "@opentui/core";
import type { Thread } from "../protocol/types";

interface ThreadExpandOptions {
  renderer: CliRenderer;
  thread: Thread;
  onResolve: () => void;
  onContinue: () => void;
  onClose: () => void;
}

export function showThreadExpand(opts: ThreadExpandOptions): BoxRenderable {
  const { renderer, thread, onResolve, onContinue, onClose } = opts;

  const messagesText = thread.messages
    .map((m) => {
      const icon = m.author === "human" ? "👤" : "🤖";
      return `${icon} ${m.text}`;
    })
    .join("\n\n");

  const container = new BoxRenderable(renderer, {
    id: "thread-expand",
    width: "80%",
    height: "60%",
    position: "absolute",
    left: "center",
    top: "center",
    borderStyle: "double",
    backgroundColor: "#1a1a2e",
    padding: 1,
    zIndex: 100,
    flexDirection: "column",
  });

  const title = new TextRenderable(renderer, {
    id: "thread-title",
    content: `Thread #${thread.id} (${thread.status}) — line ${thread.line}`,
    fg: "#CCCCCC",
    height: 1,
  });

  const body = new TextRenderable(renderer, {
    id: "thread-body",
    content: messagesText,
    flexGrow: 1,
    fg: "#FFFFFF",
  });

  const actions = new TextRenderable(renderer, {
    id: "thread-actions",
    content: "[r]esolve  [c]ontinue  [q]uit",
    fg: "#666666",
    height: 1,
  });

  container.add(title);
  container.add(body);
  container.add(actions);

  renderer.keyInput.on("keypress", function handleExpandKey(key) {
    if (key.name === "r") {
      renderer.keyInput.off("keypress", handleExpandKey);
      onResolve();
    } else if (key.name === "c") {
      renderer.keyInput.off("keypress", handleExpandKey);
      onContinue();
    } else if (key.name === "q" || key.name === "escape") {
      renderer.keyInput.off("keypress", handleExpandKey);
      onClose();
    }
  });

  return container;
}
```

- [ ] **Step 2: Implement search**

```typescript
// src/tui/search.ts
import { type CliRenderer, BoxRenderable, InputRenderable, TextRenderable } from "@opentui/core";

interface SearchOptions {
  renderer: CliRenderer;
  specLines: string[];
  cursorLine: number;
  onResult: (lineNumber: number) => void;
  onCancel: () => void;
}

export function showSearch(opts: SearchOptions): BoxRenderable {
  const { renderer, specLines, cursorLine, onResult, onCancel } = opts;

  const container = new BoxRenderable(renderer, {
    id: "search-box",
    width: "60%",
    height: 3,
    position: "absolute",
    left: "center",
    top: 2,
    borderStyle: "single",
    backgroundColor: "#1a1a2e",
    padding: 0,
    zIndex: 100,
    flexDirection: "row",
  });

  const label = new TextRenderable(renderer, {
    id: "search-label",
    content: "/",
    width: 2,
    fg: "#CCCCCC",
  });

  const input = new InputRenderable(renderer, {
    id: "search-input",
    flexGrow: 1,
    height: 1,
    focused: true,
    onEnter: (query: string) => {
      if (!query.trim()) {
        onCancel();
        return;
      }
      const lowerQuery = query.toLowerCase();
      // Search forward from current cursor position, wrapping around
      for (let offset = 0; offset < specLines.length; offset++) {
        const i = (cursorLine - 1 + offset) % specLines.length;
        if (specLines[i].toLowerCase().includes(lowerQuery)) {
          onResult(i + 1);
          return;
        }
      }
      onCancel(); // No match found
    },
  });

  container.add(label);
  container.add(input);

  renderer.keyInput.on("keypress", function handleSearchKey(key) {
    if (key.name === "escape") {
      renderer.keyInput.off("keypress", handleSearchKey);
      onCancel();
    }
  });

  return container;
}
```

- [ ] **Step 3: Implement thread list**

```typescript
// src/tui/thread-list.ts
import { type CliRenderer, BoxRenderable, TextRenderable, SelectRenderable } from "@opentui/core";
import type { Thread } from "../protocol/types";

interface ThreadListOptions {
  renderer: CliRenderer;
  threads: Thread[];
  onSelect: (lineNumber: number) => void;
  onClose: () => void;
}

export function showThreadList(opts: ThreadListOptions): BoxRenderable {
  const { renderer, threads, onSelect, onClose } = opts;

  const activeThreads = threads.filter(
    (t) => t.status === "open" || t.status === "pending"
  );

  const container = new BoxRenderable(renderer, {
    id: "thread-list",
    width: "70%",
    height: "60%",
    position: "absolute",
    left: "center",
    top: "center",
    borderStyle: "double",
    backgroundColor: "#1a1a2e",
    padding: 1,
    zIndex: 100,
    flexDirection: "column",
  });

  const title = new TextRenderable(renderer, {
    id: "list-title",
    content: `Open/Pending Threads (${activeThreads.length})`,
    fg: "#CCCCCC",
    height: 1,
  });

  const items = activeThreads.map((t) => {
    const icon = t.status === "open" ? "💬" : "🔵";
    const preview = t.messages[t.messages.length - 1]?.text.slice(0, 50) ?? "";
    return `${icon} #${t.id} line ${t.line}: ${preview}`;
  });

  const select = new SelectRenderable(renderer, {
    id: "list-select",
    items,
    flexGrow: 1,
    focused: true,
    onSelect: (index: number) => {
      if (index >= 0 && index < activeThreads.length) {
        onSelect(activeThreads[index].line);
      }
    },
  });

  container.add(title);
  container.add(select);

  renderer.keyInput.on("keypress", function handleListKey(key) {
    if (key.name === "escape" || key.name === "q") {
      renderer.keyInput.off("keypress", handleListKey);
      onClose();
    }
  });

  return container;
}
```

- [ ] **Step 4: Wire all overlays into app.ts**

Add the `e`, `/`, `l` keybindings to `src/tui/app.ts` following the same pattern as `c`.

- [ ] **Step 5: Test manually**

Run the TUI and verify:
- `e` on a thread line → expand overlay with messages
- `/` → search input, Enter jumps to first match
- `l` → thread list, Enter jumps to selected thread

- [ ] **Step 6: Commit**

```bash
git add src/tui/thread-expand.ts src/tui/search.ts src/tui/thread-list.ts src/tui/app.ts
git commit -m "feat: add thread expand, search, and thread list overlays"
```

---

### Task 10: Confirm Dialog + Final Wiring

**Files:**
- Create: `src/tui/confirm.ts`
- Modify: `src/tui/app.ts`

- [ ] **Step 1: Implement confirmation dialog**

```typescript
// src/tui/confirm.ts
import { type CliRenderer, BoxRenderable, TextRenderable } from "@opentui/core";

interface ConfirmOptions {
  renderer: CliRenderer;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function showConfirm(opts: ConfirmOptions): BoxRenderable {
  const { renderer, message, onConfirm, onCancel } = opts;

  const container = new BoxRenderable(renderer, {
    id: "confirm",
    width: "50%",
    height: 5,
    position: "absolute",
    left: "center",
    top: "center",
    borderStyle: "double",
    backgroundColor: "#1a1a2e",
    padding: 1,
    zIndex: 200,
    flexDirection: "column",
  });

  const text = new TextRenderable(renderer, {
    id: "confirm-text",
    content: message,
    fg: "#FFFFFF",
  });

  const hint = new TextRenderable(renderer, {
    id: "confirm-hint",
    content: "[y]es  [n]o",
    fg: "#666666",
    height: 1,
  });

  container.add(text);
  container.add(hint);

  renderer.keyInput.on("keypress", function handleConfirm(key) {
    if (key.name === "y") {
      renderer.keyInput.off("keypress", handleConfirm);
      onConfirm();
    } else if (key.name === "n" || key.name === "escape") {
      renderer.keyInput.off("keypress", handleConfirm);
      onCancel();
    }
  });

  return container;
}
```

- [ ] **Step 2: Wire `:q` to show confirmation**

Update the `:q` handler in `src/tui/app.ts`:

```typescript
} else if (commandBuffer === ":q") {
  commandBuffer = "";
  const threadCount = state.threads.filter(
    (t) => t.status === "open" || t.status === "pending"
  ).length;
  const msg = threadCount > 0
    ? `Submit review with ${threadCount} open/pending thread(s)? [y/n]`
    : "Submit review? [y/n]";
  const overlay = showConfirm({
    renderer,
    message: msg,
    onConfirm: () => {
      writeDraftFile(draftPath, state.toDraft());
      renderer.root.remove(overlay);
      renderer.destroy();
    },
    onCancel: () => {
      renderer.root.remove(overlay);
    },
  });
  renderer.root.add(overlay);
}
```

- [ ] **Step 3: Test the full flow manually**

1. `bun run bin/spectral.ts <spec-file>`
2. Navigate with `j/k`
3. Add comment with `c`
4. Expand thread with `e`
5. Search with `/`
6. Resolve with `r`
7. `:w` to save draft
8. `:q` to submit (confirmation dialog appears)
9. `:q!` to quit without saving

- [ ] **Step 4: Run all tests**

Run: `bun test`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/tui/confirm.ts src/tui/app.ts
git commit -m "feat: add confirmation dialog, complete TUI keybinding wiring"
```

---

## Chunk 5: Polish + Distribution

### Task 11: Make it executable

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Link the binary locally**

```bash
bun link
```

- [ ] **Step 2: Verify it runs as a command**

Run: `spectral --help`
Expected: Usage message

- [ ] **Step 3: Test the full review cycle end-to-end**

1. Create a test spec file
2. Run `spectral test-spec.md`
3. Add comments, save, quit
4. Verify `.review.json` exists with correct structure
5. Run `spectral test-spec.md` again — verify threads load
6. Approve — verify `APPROVED:` output

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat: make spectral executable via bun link"
```

---

### Task 12: Final test pass + cleanup

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All PASS

- [ ] **Step 2: Clean up any TODOs or stub code**

Search for `TODO` and remove or implement.

- [ ] **Step 3: Commit and push**

```bash
git add -A
git commit -m "chore: cleanup TODOs, final test pass"
git push
```
