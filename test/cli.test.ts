import { describe, it, expect, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";

const CLI = resolve(import.meta.dir, "../bin/spectral.ts");

interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runCli(
  args: string[],
  env: Record<string, string> = {}
): Promise<SpawnResult> {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], {
    env: { ...process.env, SPECTRAL_SKIP_TUI: "1", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

describe("CLI entry point", () => {
  let tmpDir: string;

  // Create a fresh temp dir before each test
  function setup(): string {
    tmpDir = mkdtempSync(join(tmpdir(), "spectral-test-"));
    return tmpDir;
  }

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("exits 1 for missing spec file", async () => {
    setup();
    const result = await runCli([join(tmpDir, "nonexistent.md")]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("not found");
  });

  it("exits 0 with no output when no review file exists", async () => {
    const dir = setup();
    const specFile = join(dir, "spec.md");
    writeFileSync(specFile, "# My Spec\n");

    const result = await runCli([specFile]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");
    expect(result.stderr.trim()).toBe("");
  });

  it("outputs APPROVED when draft has approved flag", async () => {
    const dir = setup();
    const specFile = join(dir, "spec.md");
    writeFileSync(specFile, "# My Spec\n");

    const draftPath = join(dir, "spec.review.draft.json");
    writeFileSync(draftPath, JSON.stringify({ approved: true }));

    const result = await runCli([specFile]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("APPROVED:");
    expect(result.stdout).toContain("spec.review.json");

    // Draft should be deleted
    const approvedDraftExists = await Bun.file(draftPath)
      .exists()
      .catch(() => false);
    expect(approvedDraftExists).toBe(false);
  });

  it("merges draft into review file", async () => {
    const dir = setup();
    const specFile = join(dir, "spec.md");
    writeFileSync(specFile, "# My Spec\n");

    const draft = {
      threads: [
        {
          id: "t1",
          line: 5,
          status: "open",
          messages: [{ author: "human", text: "This needs clarification" }],
        },
      ],
    };
    const draftPath = join(dir, "spec.review.draft.json");
    writeFileSync(draftPath, JSON.stringify(draft));

    const result = await runCli([specFile]);
    expect(result.exitCode).toBe(0);

    const reviewPath = join(dir, "spec.review.json");
    const reviewFile = await Bun.file(reviewPath).json();
    expect(reviewFile.threads).toHaveLength(1);
    expect(reviewFile.threads[0].id).toBe("t1");

    // Draft should be deleted
    const draftExists = await Bun.file(draftPath)
      .exists()
      .catch(() => false);
    expect(draftExists).toBe(false);

    // Should output review path (has open thread)
    expect(result.stdout).toContain("spec.review.json");
  });

  it("warns and deletes corrupted draft file", async () => {
    const dir = setup();
    const specFile = join(dir, "spec.md");
    writeFileSync(specFile, "# My Spec\n");

    const draftPath = join(dir, "spec.review.draft.json");
    writeFileSync(draftPath, "this is not valid JSON {{{{");

    const result = await runCli([specFile]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("corrupted");

    // Draft should be deleted
    const draftExists = await Bun.file(draftPath)
      .exists()
      .catch(() => false);
    expect(draftExists).toBe(false);
  });

  it("prints nothing when human adds no comments (no prior review)", async () => {
    const dir = setup();
    const specFile = join(dir, "spec.md");
    writeFileSync(specFile, "# My Spec\n");

    // No draft, no review file — TUI is skipped, nothing happened
    const result = await runCli([specFile]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });
});
