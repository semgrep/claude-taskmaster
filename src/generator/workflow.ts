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
 * Workaround for https://github.com/anthropics/claude-code-action/issues/944
 * When track_progress is disabled (labeled events), claude-code-action does not
 * post a PR comment automatically. This suffix instructs Claude to post one itself.
 */
const LABELED_EVENT_COMMENT_SUFFIX =
  "\n\n${{ github.event.action == 'labeled' && format(" +
  "'Since this run was triggered by a label event, automatic progress tracking is disabled. " +
  "After completing the task, you MUST post your full response as a PR comment. " +
  "Write your response to /tmp/claude-response.md, then run: " +
  "gh pr comment {0} --repo {1} --body-file /tmp/claude-response.md', " +
  "github.event.pull_request.number, github.repository) || '' }}";

/**
 * Default tools that are always allowed. These are all safe, non-mutating
 * tools (no permission required) plus scoped Bash patterns for git/gh.
 */
const DEFAULT_ALLOWED_TOOLS = [
  // File reading / search
  "Read",
  "Grep",
  "Glob",
  // Subagents & task management
  "Agent",
  "Skill",
  "TaskCreate",
  "TaskGet",
  "TaskList",
  "TaskOutput",
  "TaskStop",
  "TaskUpdate",
  "TodoWrite",
  // Worktree management
  "EnterWorktree",
  "ExitWorktree",
  // Scheduling
  "CronCreate",
  "CronDelete",
  "CronList",
  // Tool discovery
  "ToolSearch",
  // Code intelligence
  "LSP",
  // MCP resources
  "ListMcpResourcesTool",
  "ReadMcpResourceTool",
  // Plan mode
  "EnterPlanMode",
  "ExitPlanMode",
  // Scoped Bash for git/gh
  "Bash(git diff*)",
  "Bash(git log*)",
  "Bash(git show*)",
  "Bash(gh pr *)",
];

function buildActionStep(
  prompt: string,
  systemPrompt: string | null,
  options: {
    claude_args?: string;
    plugins?: string;
    allowed_tools?: string[];
    actionVersion: string;
  }
): Record<string, unknown> {
  const allowedTools = [
    ...new Set([...DEFAULT_ALLOWED_TOOLS, ...(options.allowed_tools || [])]),
  ];

  const withBlock: Record<string, unknown> = {
    anthropic_api_key: "${{ secrets.ANTHROPIC_API_KEY }}",
    github_token: "${{ secrets.GITHUB_TOKEN }}",
    track_progress: "${{ github.event.action != 'labeled' }}",
    prompt: prompt + LABELED_EVENT_COMMENT_SUFFIX,
  };

  const toolArgs = `--allowedTools '${allowedTools.join(",")}'`;
  let claudeArgs = options.claude_args
    ? `${options.claude_args} ${toolArgs}`
    : toolArgs;

  if (systemPrompt) {
    const escaped = systemPrompt.replace(/'/g, "'\\''");
    const appendArg = `--append-system-prompt '${escaped}'`;
    claudeArgs = claudeArgs ? `${claudeArgs} ${appendArg}` : appendArg;
  }

  if (claudeArgs) {
    withBlock.claude_args = claudeArgs;
  }
  if (options.plugins) {
    withBlock.plugins = options.plugins;
  }
  return {
    name: "Run Claude Code Action",
    uses: `anthropics/claude-code-action@${options.actionVersion}`,
    with: withBlock,
  };
}

/**
 * Generates a reusable workflow for a single task spec.
 */
export function generateWorkflow(
  spec: ValidatedSpec,
  systemPrompt: string | null,
  actionVersion: string = "v1"
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
    buildActionStep(spec.spec.action.prompt, systemPrompt, {
      claude_args: spec.spec.action.claude_args,
      plugins: spec.spec.action.plugins,
      allowed_tools: spec.spec.action.allowed_tools,
      actionVersion,
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
