import { describe, expect, test } from "bun:test";
import { TaskmasterSpecSchema, ActionSchema, GhaStepSchema } from "../src/schema";

describe("ActionSchema", () => {
  test("accepts valid action", () => {
    const result = ActionSchema.safeParse({
      prompt: "Review this code",
      track_progress: true,
    });
    expect(result.success).toBe(true);
  });

  test("requires prompt", () => {
    const result = ActionSchema.safeParse({
      track_progress: true,
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty prompt", () => {
    const result = ActionSchema.safeParse({
      prompt: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects unknown keys (strict)", () => {
    const result = ActionSchema.safeParse({
      prompt: "hello",
      unknown_field: true,
    });
    expect(result.success).toBe(false);
  });

  test("accepts optional fields", () => {
    const result = ActionSchema.safeParse({
      prompt: "hello",
      claude_args: "--timeout 300",
      plugins: "some-plugin",
      track_progress: false,
    });
    expect(result.success).toBe(true);
  });
});

describe("GhaStepSchema", () => {
  test("accepts step with uses", () => {
    const result = GhaStepSchema.safeParse({
      name: "Checkout",
      uses: "actions/checkout@v4",
    });
    expect(result.success).toBe(true);
  });

  test("accepts step with run", () => {
    const result = GhaStepSchema.safeParse({
      name: "Build",
      run: "npm run build",
    });
    expect(result.success).toBe(true);
  });

  test("rejects step without uses or run", () => {
    const result = GhaStepSchema.safeParse({
      name: "Bad step",
      env: { FOO: "bar" },
    });
    expect(result.success).toBe(false);
  });

  test("rejects step with both uses and run (XOR)", () => {
    const result = GhaStepSchema.safeParse({
      name: "Conflicting",
      uses: "actions/checkout@v4",
      run: "echo hi",
    });
    expect(result.success).toBe(false);
  });

  test("rejects unknown properties (strict, per SchemaStore)", () => {
    const result = GhaStepSchema.safeParse({
      uses: "actions/checkout@v4",
      "custom-field": "not-allowed",
    });
    expect(result.success).toBe(false);
  });

  test("accepts all valid GHA step properties", () => {
    const result = GhaStepSchema.safeParse({
      id: "my-step",
      name: "Full step",
      uses: "actions/checkout@v4",
      if: "github.event_name == 'push'",
      with: { "fetch-depth": 0 },
      env: { NODE_ENV: "test" },
      "continue-on-error": true,
      "timeout-minutes": 10,
    });
    expect(result.success).toBe(true);
  });

  test("accepts if as boolean or number", () => {
    expect(GhaStepSchema.safeParse({ uses: "a/b@v1", if: true }).success).toBe(true);
    expect(GhaStepSchema.safeParse({ uses: "a/b@v1", if: 1 }).success).toBe(true);
  });

  test("accepts expression syntax for continue-on-error", () => {
    const result = GhaStepSchema.safeParse({
      uses: "a/b@v1",
      "continue-on-error": "${{ matrix.experimental }}",
    });
    expect(result.success).toBe(true);
  });

  test("accepts expression syntax for timeout-minutes", () => {
    const result = GhaStepSchema.safeParse({
      uses: "a/b@v1",
      "timeout-minutes": "${{ inputs.timeout }}",
    });
    expect(result.success).toBe(true);
  });

  test("accepts expression string as env block", () => {
    const result = GhaStepSchema.safeParse({
      run: "echo hi",
      env: "${{ fromJSON(needs.setup.outputs.env) }}",
    });
    expect(result.success).toBe(true);
  });

  test("allows shell and working-directory with run", () => {
    const result = GhaStepSchema.safeParse({
      run: "echo hi",
      shell: "bash",
      "working-directory": "./src",
    });
    expect(result.success).toBe(true);
  });

  test("rejects shell without run", () => {
    const result = GhaStepSchema.safeParse({
      uses: "actions/checkout@v4",
      shell: "bash",
    });
    expect(result.success).toBe(false);
  });

  test("rejects working-directory without run", () => {
    const result = GhaStepSchema.safeParse({
      uses: "actions/checkout@v4",
      "working-directory": "./src",
    });
    expect(result.success).toBe(false);
  });

  test("env/with values accept string, number, and boolean", () => {
    const result = GhaStepSchema.safeParse({
      uses: "a/b@v1",
      with: { str: "hello", num: 42, bool: true },
      env: { DEBUG: "true", RETRIES: 3, VERBOSE: false },
    });
    expect(result.success).toBe(true);
  });
});

describe("TaskmasterSpecSchema", () => {
  test("accepts valid spec", () => {
    const result = TaskmasterSpecSchema.safeParse({
      name: "code-review",
      action: { prompt: "Review this" },
    });
    expect(result.success).toBe(true);
  });

  test("accepts full spec", () => {
    const result = TaskmasterSpecSchema.safeParse({
      name: "lint-check",
      description: "Check for linting issues",
      action: { prompt: "Check lint", claude_args: "--timeout 300" },
      checkout: { "fetch-depth": 0 },
      pre_action_steps: [{ uses: "actions/setup-node@v4", with: { "node-version": "20" } }],
      post_action_steps: [{ run: "echo done" }],
    });
    expect(result.success).toBe(true);
  });

  test("rejects unknown root keys (strict)", () => {
    const result = TaskmasterSpecSchema.safeParse({
      name: "test",
      action: { prompt: "hello" },
      unknown_root_key: true,
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing name", () => {
    const result = TaskmasterSpecSchema.safeParse({
      action: { prompt: "hello" },
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing action", () => {
    const result = TaskmasterSpecSchema.safeParse({
      name: "test",
    });
    expect(result.success).toBe(false);
  });
});
