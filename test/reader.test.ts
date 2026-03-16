import { describe, expect, test } from "bun:test";
import { readInputDir } from "../src/reader";
import { join } from "node:path";

const VALID_DIR = join(import.meta.dir, "fixtures/valid");
const INVALID_DIR = join(import.meta.dir, "fixtures/invalid");

describe("readInputDir", () => {
  test("reads YAML files and SYSTEM_PROMPT.md from valid dir", async () => {
    const result = await readInputDir(VALID_DIR);

    expect(result.systemPrompt).toBeTruthy();
    expect(result.systemPrompt).toContain("helpful code review assistant");
    expect(result.specs.length).toBe(2);

    const names = result.specs.map((s) => s.taskName).sort();
    expect(names).toEqual(["code-review", "lint-check"]);
  });

  test("returns null systemPrompt when no SYSTEM_PROMPT.md", async () => {
    const result = await readInputDir(INVALID_DIR);
    expect(result.systemPrompt).toBeNull();
  });

  test("parses YAML content into data", async () => {
    const result = await readInputDir(VALID_DIR);
    const codeReview = result.specs.find((s) => s.taskName === "code-review");
    expect(codeReview).toBeTruthy();
    expect((codeReview!.data as any).name).toBe("code-review");
    expect((codeReview!.data as any).action.prompt).toContain("Review the code");
  });

  test("derives task name from filename", async () => {
    const result = await readInputDir(VALID_DIR);
    for (const spec of result.specs) {
      expect(spec.filename).toMatch(/\.yml$/);
      expect(spec.taskName).not.toMatch(/\.yml$/);
    }
  });
});
