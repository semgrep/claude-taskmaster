import { sanitizeJobId } from "./workflow";
import type { ValidatedSpec } from "../validator";

export interface GeneratedDispatcher {
  filename: string;
  content: Record<string, unknown>;
}

/**
 * Generates the dispatcher workflow that routes to per-task reusable workflows
 * based on PR labels. One job per task with an `if` condition.
 */
export function generateDispatcher(
  specs: ValidatedSpec[]
): GeneratedDispatcher {
  const jobs: Record<string, unknown> = {};

  for (const spec of specs) {
    const jobId = sanitizeJobId(spec.taskName);
    const name = spec.spec.description || spec.taskName;
    jobs[jobId] = {
      name,
      if: `contains(github.event.pull_request.labels.*.name, '${spec.taskName}')`,
      uses: `./.github/workflows/taskmaster-${spec.taskName}.yml`,
      secrets: "inherit",
    };
  }

  const dispatcher: Record<string, unknown> = {
    name: "Taskmaster Dispatcher",
    on: {
      pull_request: {
        types: ["opened", "synchronize", "reopened", "labeled"],
      },
    },
    jobs,
  };

  return {
    filename: "taskmaster-dispatcher.yml",
    content: dispatcher,
  };
}
