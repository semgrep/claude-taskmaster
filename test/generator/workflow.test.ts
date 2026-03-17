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

  test("includes claude-code-action step with required fields", () => {
    const result = generateWorkflow(minimalSpec, null);
    const jobs = result.content.jobs as any;
    const steps = jobs.task.steps;
    const actionStep = steps.find(
      (s: any) => s.uses === "anthropics/claude-code-action@v1"
    );
    expect(actionStep).toBeTruthy();
    expect(actionStep.with.prompt).toBe("Review this code");
    expect(actionStep.with.github_token).toBe("${{ secrets.GITHUB_TOKEN }}");
    expect(actionStep.with.track_progress).toBe(true);
    // default allowed tools passed via claude_args
    const args: string = actionStep.with.claude_args;
    for (const tool of [
      "Read", "Grep", "Glob", "Agent", "Skill",
      "TaskCreate", "TaskGet", "TaskList", "TaskOutput", "TaskStop", "TaskUpdate",
      "TodoWrite", "EnterWorktree", "ExitWorktree",
      "CronCreate", "CronDelete", "CronList",
      "ToolSearch", "LSP", "ListMcpResourcesTool", "ReadMcpResourceTool",
      "EnterPlanMode", "ExitPlanMode",
    ]) {
      expect(args).toContain(`--allowedTools '${tool}'`);
    }
    expect(args).toContain("--allowedTools 'Bash(git diff*)'");
    expect(args).toContain("--allowedTools 'Bash(git log*)'");
    expect(args).toContain("--allowedTools 'Bash(git show*)'");
    expect(args).toContain("--allowedTools 'Bash(gh pr *)'");
  });

  test("merges user-specified allowed_tools with defaults", () => {
    const spec: ValidatedSpec = {
      filename: "test.yml",
      taskName: "test",
      spec: {
        name: "test",
        action: {
          prompt: "Test",
          allowed_tools: ["Edit", "Write", "Bash(npm test*)"],
        },
      },
    };
    const result = generateWorkflow(spec, null);
    const jobs = result.content.jobs as any;
    const actionStep = jobs.task.steps.find(
      (s: any) => s.uses === "anthropics/claude-code-action@v1"
    );
    const args: string = actionStep.with.claude_args;
    // defaults still present
    expect(args).toContain("--allowedTools 'Read'");
    expect(args).toContain("--allowedTools 'Agent'");
    // user tools appended
    expect(args).toContain("--allowedTools 'Edit'");
    expect(args).toContain("--allowedTools 'Write'");
    expect(args).toContain("--allowedTools 'Bash(npm test*)'");
  });

  test("deduplicates user-specified tools that overlap with defaults", () => {
    const spec: ValidatedSpec = {
      filename: "test.yml",
      taskName: "test",
      spec: {
        name: "test",
        action: {
          prompt: "Test",
          allowed_tools: ["Read", "Grep", "Edit"],
        },
      },
    };
    const result = generateWorkflow(spec, null);
    const jobs = result.content.jobs as any;
    const actionStep = jobs.task.steps.find(
      (s: any) => s.uses === "anthropics/claude-code-action@v1"
    );
    const args: string = actionStep.with.claude_args;
    const readMatches = args.match(/--allowedTools 'Read'/g);
    expect(readMatches).toHaveLength(1);
    const grepMatches = args.match(/--allowedTools 'Grep'/g);
    expect(grepMatches).toHaveLength(1);
    // non-default tool still added
    expect(args).toContain("--allowedTools 'Edit'");
  });

  test("passes system prompt via --append-system-prompt", () => {
    const result = generateWorkflow(minimalSpec, "Be helpful.");
    const jobs = result.content.jobs as any;
    const actionStep = jobs.task.steps.find(
      (s: any) => s.uses === "anthropics/claude-code-action@v1"
    );
    expect(actionStep.with.prompt).toBe("Review this code");
    expect(actionStep.with.claude_args).toContain("--append-system-prompt 'Be helpful.'");
    expect(actionStep.with.claude_args).toContain("--allowedTools");
  });

  test("appends system prompt to existing claude_args", () => {
    const spec: ValidatedSpec = {
      filename: "test.yml",
      taskName: "test",
      spec: {
        name: "test",
        action: { prompt: "Test", claude_args: "--timeout 600" },
      },
    };
    const result = generateWorkflow(spec, "Be helpful.");
    const jobs = result.content.jobs as any;
    const actionStep = jobs.task.steps.find(
      (s: any) => s.uses === "anthropics/claude-code-action@v1"
    );
    expect(actionStep.with.claude_args).toContain("--timeout 600");
    expect(actionStep.with.claude_args).toContain("--append-system-prompt 'Be helpful.'");
    expect(actionStep.with.claude_args).toContain("--allowedTools");
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
        },
      },
    };
    const result = generateWorkflow(spec, null);
    const jobs = result.content.jobs as any;
    const actionStep = jobs.task.steps.find(
      (s: any) => s.uses === "anthropics/claude-code-action@v1"
    );
    expect(actionStep.with.claude_args).toContain("--timeout 600");
    expect(actionStep.with.claude_args).toContain("--allowedTools");
    expect(actionStep.with.plugins).toBe("my-plugin");
  });
});
