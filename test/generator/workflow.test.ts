import { describe, expect, test } from "bun:test";
import { generateWorkflow, sanitizeJobId } from "../../src/generator/workflow";
import type { ValidatedSpec } from "../../src/validator";

describe("sanitizeJobId", () => {
  test("keeps valid names unchanged", () => {
    expect(sanitizeJobId("code-review")).toBe("code-review");
    expect(sanitizeJobId("lint_check")).toBe("lint_check");
  });

  test("replaces invalid characters", () => {
    expect(sanitizeJobId("code review!")).toBe("code_review_");
  });

  test("prefixes names starting with a number", () => {
    expect(sanitizeJobId("123task")).toBe("_123task");
  });
});

describe("generateWorkflow", () => {
  const minimalSpec: ValidatedSpec = {
    filename: "code-review.yml",
    taskName: "code-review",
    spec: {
      name: "code-review",
      action: { prompt: "Review this code" },
    },
  };

  test("generates basic workflow structure", () => {
    const result = generateWorkflow(minimalSpec, null);

    expect(result.taskName).toBe("code-review");
    expect(result.filename).toBe("taskmaster-code-review.yml");
    expect(result.content.name).toBe("taskmaster-code-review");
    expect(result.content.on).toEqual({ workflow_call: {} });
    expect(result.content.permissions).toBeTruthy();
  });

  test("includes checkout step", () => {
    const result = generateWorkflow(minimalSpec, null);
    const jobs = result.content.jobs as any;
    const steps = jobs.task.steps;
    expect(steps[0].uses).toBe("actions/checkout@v4");
  });

  test("includes claude-code-action step", () => {
    const result = generateWorkflow(minimalSpec, null);
    const jobs = result.content.jobs as any;
    const steps = jobs.task.steps;
    const actionStep = steps.find(
      (s: any) => s.uses === "anthropics/claude-code-action@v1"
    );
    expect(actionStep).toBeTruthy();
    expect(actionStep.with.prompt).toBe("Review this code");
  });

  test("prepends default prompt", () => {
    const result = generateWorkflow(minimalSpec, "Be helpful.");
    const jobs = result.content.jobs as any;
    const actionStep = jobs.task.steps.find(
      (s: any) => s.uses === "anthropics/claude-code-action@v1"
    );
    expect(actionStep.with.prompt).toBe("Be helpful.\n\nReview this code");
  });

  test("includes pre and post action steps", () => {
    const fullSpec: ValidatedSpec = {
      filename: "lint.yml",
      taskName: "lint",
      spec: {
        name: "lint",
        action: { prompt: "Check lint" },
        pre_action_steps: [{ uses: "actions/setup-node@v4" }],
        post_action_steps: [{ run: "echo done" }],
      },
    };
    const result = generateWorkflow(fullSpec, null);
    const jobs = result.content.jobs as any;
    const steps = jobs.task.steps;

    // checkout, pre-action, claude action, post-action
    expect(steps.length).toBe(4);
    expect(steps[1].uses).toBe("actions/setup-node@v4");
    expect(steps[3].run).toBe("echo done");
  });

  test("passes checkout args through", () => {
    const spec: ValidatedSpec = {
      filename: "test.yml",
      taskName: "test",
      spec: {
        name: "test",
        action: { prompt: "Test" },
        checkout: { "fetch-depth": 0 },
      },
    };
    const result = generateWorkflow(spec, null);
    const jobs = result.content.jobs as any;
    expect(jobs.task.steps[0].with).toEqual({ "fetch-depth": 0 });
  });

  test("includes optional action fields", () => {
    const spec: ValidatedSpec = {
      filename: "test.yml",
      taskName: "test",
      spec: {
        name: "test",
        action: {
          prompt: "Test",
          claude_args: "--timeout 600",
          plugins: "my-plugin",
          track_progress: true,
        },
      },
    };
    const result = generateWorkflow(spec, null);
    const jobs = result.content.jobs as any;
    const actionStep = jobs.task.steps.find(
      (s: any) => s.uses === "anthropics/claude-code-action@v1"
    );
    expect(actionStep.with.claude_args).toBe("--timeout 600");
    expect(actionStep.with.plugins).toBe("my-plugin");
    expect(actionStep.with.track_progress).toBe(true);
  });
});
