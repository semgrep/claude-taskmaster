import { describe, expect, test } from "bun:test";
import { generateDispatcher } from "../../src/generator/dispatcher";
import type { ValidatedSpec } from "../../src/validator";

describe("generateDispatcher", () => {
  const specs: ValidatedSpec[] = [
    {
      filename: "code-review.yml",
      taskName: "code-review",
      spec: { name: "code-review", description: "Review code changes", action: { prompt: "Review" } },
    },
    {
      filename: "lint-check.yml",
      taskName: "lint-check",
      spec: { name: "lint-check", action: { prompt: "Lint" } },
    },
  ];

  test("generates dispatcher with correct structure", () => {
    const result = generateDispatcher(specs);

    expect(result.filename).toBe("taskmaster-dispatcher.yml");
    expect(result.content.name).toBe("Taskmaster Dispatcher");
    expect((result.content.on as any).pull_request.types).toEqual([
      "opened",
      "synchronize",
      "reopened",
      "labeled",
    ]);
  });

  test("creates one job per task", () => {
    const result = generateDispatcher(specs);
    const jobs = result.content.jobs as Record<string, any>;

    expect(Object.keys(jobs).length).toBe(2);
    expect(jobs["code-review"]).toBeTruthy();
    expect(jobs["lint-check"]).toBeTruthy();
  });

  test("each job has correct if condition", () => {
    const result = generateDispatcher(specs);
    const jobs = result.content.jobs as Record<string, any>;

    expect(jobs["code-review"].if).toBe(
      "contains(github.event.pull_request.labels.*.name, 'code-review')"
    );
    expect(jobs["lint-check"].if).toBe(
      "contains(github.event.pull_request.labels.*.name, 'lint-check')"
    );
  });

  test("each job uses correct reusable workflow", () => {
    const result = generateDispatcher(specs);
    const jobs = result.content.jobs as Record<string, any>;

    expect(jobs["code-review"].uses).toBe(
      "./.github/workflows/taskmaster-code-review.yml"
    );
    expect(jobs["lint-check"].uses).toBe(
      "./.github/workflows/taskmaster-lint-check.yml"
    );
  });

  test("each job inherits secrets", () => {
    const result = generateDispatcher(specs);
    const jobs = result.content.jobs as Record<string, any>;

    for (const job of Object.values(jobs)) {
      expect(job.secrets).toBe("inherit");
    }
  });

  test("job name uses description when available, falls back to taskName", () => {
    const result = generateDispatcher(specs);
    const jobs = result.content.jobs as Record<string, any>;

    expect(jobs["code-review"].name).toBe("Review code changes");
    expect(jobs["lint-check"].name).toBe("lint-check");
  });
});
