# claude-taskmaster

Define Claude code review and automation tasks as simple YAML specs, and generate valid GitHub Actions workflows from them.

Two parts: a **Bun CLI** that generates workflows, and a **GitHub Action** that wraps it.

## How It Works

1. Write task specs as YAML files in a directory (e.g. `.github/taskmaster/`)
2. Run the CLI (or the GitHub Action) to generate:
   - One **reusable workflow** per task (checkout → your pre-steps → claude-code-action → your post-steps)
   - One **dispatcher workflow** that routes tasks based on PR labels

The dispatcher creates one job per task, each gated by an `if: contains(github.event.pull_request.labels.*.name, '<task-name>')` condition. Label a PR with a task name and that task runs.

## Writing Specs

### Minimal spec

```yaml
# .github/taskmaster/code-review.yml
name: code-review
action:
  prompt: "Review the code changes in this PR."
```

### Full spec

```yaml
name: lint-check
description: "Check for linting issues"

# args passed to actions/checkout
checkout:
  fetch-depth: 0

# steps that run before claude-code-action
pre_action_steps:
  - name: Setup Node
    uses: actions/setup-node@v4
    with:
      node-version: "20"
  - name: Install deps
    run: npm ci

# the claude-code-action configuration
action:
  prompt: "Check this PR for linting and style issues."
  claude_args: "--timeout 300"
  plugins: "my-plugin"

# steps that run after claude-code-action
post_action_steps:
  - name: Report
    run: echo "Lint check complete"
```

### DEFAULT.md

Place a `DEFAULT.md` file in the same directory as your specs. Its content is prepended to every task's prompt — useful for shared instructions.

```markdown
<!-- .github/taskmaster/DEFAULT.md -->
You are a code review assistant. Follow these guidelines:
- Be constructive and specific
- Focus on correctness, security, and maintainability
```

### Spec Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Task name (used for labels, workflow names, job IDs) |
| `description` | string | no | Human-readable description |
| `action` | object | yes | Claude code action configuration |
| `action.prompt` | string | yes | The prompt sent to Claude |
| `action.claude_args` | string | no | Extra CLI args for Claude |
| `action.plugins` | string | no | Plugins to enable |
| `checkout` | object | no | Args passed to `actions/checkout@v4` |
| `pre_action_steps` | array | no | GHA steps to run before the action |
| `post_action_steps` | array | no | GHA steps to run after the action |

Pre/post action steps are validated against the [GitHub Actions step schema](https://json.schemastore.org/github-workflow.json) — each step must have exactly one of `uses` or `run`, and `shell`/`working-directory` are only valid with `run`.

## CLI Usage

```bash
# Generate workflows
bun run src/cli.ts <input-dir> <output-dir>

# Example
bun run src/cli.ts .github/taskmaster .github/workflows
```

This generates:
- `taskmaster-<name>.yml` — one reusable workflow per spec
- `taskmaster-dispatcher.yml` — dispatcher that routes by PR label

## GitHub Action Usage

```yaml
# .github/workflows/update-taskmaster.yml
name: Update Taskmaster Workflows
on:
  push:
    paths:
      - '.github/taskmaster/**'

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/claude-taskmaster@v1
        with:
          input_dir: .github/taskmaster    # default
          output_dir: .github/workflows    # default
```

The action runs the CLI, and if workflows changed, creates a branch with the updates and comments on the PR with cherry-pick instructions.

## Development

Requires [devenv](https://devenv.sh/) (uses Nix flakes for reproducible environment).

```bash
# Enter dev shell (provides bun)
devenv shell

# Install deps
bun install

# Run tests
bun test

# Generate workflows from dogfood specs
bun run src/cli.ts .github/taskmaster .github/workflows
```

## Architecture

```
src/
├── cli.ts              # CLI entrypoint: read → validate → generate → write
├── schema.ts           # Zod schemas matching GHA SchemaStore spec
├── reader.ts           # Reads YAML specs + DEFAULT.md from input dir
├── validator.ts        # Validates specs, collects & formats errors
└── generator/
    ├── index.ts        # Re-exports
    ├── workflow.ts     # Generates reusable workflow per task
    ├── dispatcher.ts   # Generates dispatcher workflow (one job per task)
    └── yaml-writer.ts  # Serializes & writes YAML with auto-generated header
```

## Design Decisions

- **No dynamic matrix dispatch**: GHA doesn't support dynamic `uses:` paths for reusable workflow calls, so the dispatcher generates one job per task with `if` conditions instead.
- **Strict schemas**: The root spec and `action` block use strict Zod schemas (reject unknown keys) to catch typos. Pre/post steps are validated against the GHA step spec from SchemaStore.
- **`secrets: inherit`**: Reusable workflows get secrets from the dispatcher, keeping configuration simple.
- **Hardcoded permissions**: Reusable workflows set `contents: write`, `pull-requests: write`, `issues: write`, `id-token: write` — what claude-code-action needs.
