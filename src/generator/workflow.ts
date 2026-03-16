import type { ValidatedSpec } from "../validator";
import type { GhaStep } from "../schema";

export interface GeneratedWorkflow {
  taskName: string;
  filename: string;
  content: Record<string, unknown>;
}

/**
 * Sanitizes a task name for use as a GHA job ID.
 * Must match [a-zA-Z_][a-zA-Z0-9_-]*
 */
export function sanitizeJobId(name: string): string {
  let sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!/^[a-zA-Z_]/.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }
  return sanitized;
}

/**
 * Converts a GhaStep (Zod-parsed) back to a plain object for YAML output.
 */
function stepToYaml(step: GhaStep): Record<string, unknown> {
  // GhaStep is passthrough so it's already a plain object
  return step as Record<string, unknown>;
}

/**
 * Builds the claude-code-action step.
 */
function buildActionStep(
  prompt: string,
  defaultPrompt: string | null,
  options: {
    claude_args?: string;
    plugins?: string;
    track_progress?: boolean;
  }
): Record<string, unknown> {
  const fullPrompt = defaultPrompt
    ? `${defaultPrompt}\n\n${prompt}`
    : prompt;

  const withBlock: Record<string, unknown> = {
    anthropic_api_key: "${{ secrets.ANTHROPIC_API_KEY }}",
    use_sticky_comment: true,
    prompt: fullPrompt,
  };

  if (options.claude_args) {
    withBlock.claude_args = options.claude_args;
  }
  if (options.plugins) {
    withBlock.plugins = options.plugins;
  }
  if (options.track_progress !== undefined) {
    withBlock.track_progress = options.track_progress;
  }

  return {
    name: "Run Claude Code Action",
    uses: "anthropics/claude-code-action@v1",
    with: withBlock,
  };
}

/**
 * Generates a reusable workflow for a single task spec.
 */
export function generateWorkflow(
  spec: ValidatedSpec,
  defaultPrompt: string | null
): GeneratedWorkflow {
  const steps: Record<string, unknown>[] = [];

  // Checkout step
  const checkoutStep: Record<string, unknown> = {
    name: "Checkout",
    uses: "actions/checkout@v4",
  };
  if (spec.spec.checkout && Object.keys(spec.spec.checkout).length > 0) {
    checkoutStep.with = spec.spec.checkout;
  }
  steps.push(checkoutStep);

  // Pre-action steps
  if (spec.spec.pre_action_steps) {
    for (const step of spec.spec.pre_action_steps) {
      steps.push(stepToYaml(step));
    }
  }

  // Claude code action step
  steps.push(
    buildActionStep(spec.spec.action.prompt, defaultPrompt, {
      claude_args: spec.spec.action.claude_args,
      plugins: spec.spec.action.plugins,
      track_progress: spec.spec.action.track_progress,
    })
  );

  // Post-action steps
  if (spec.spec.post_action_steps) {
    for (const step of spec.spec.post_action_steps) {
      steps.push(stepToYaml(step));
    }
  }

  const workflow: Record<string, unknown> = {
    name: `taskmaster-${spec.taskName}`,
    on: { workflow_call: {} },
    permissions: {
      contents: "write",
      "pull-requests": "write",
      issues: "write",
      "id-token": "write",
    },
    jobs: {
      task: {
        "runs-on": "ubuntu-latest",
        steps,
      },
    },
  };

  return {
    taskName: spec.taskName,
    filename: `taskmaster-${spec.taskName}.yml`,
    content: workflow,
  };
}
