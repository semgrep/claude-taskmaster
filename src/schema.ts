import { z } from "zod";

/**
 * Matches a GHA expression: ${{ ... }}
 */
const ExpressionSyntax = z.string().regex(
  /^\$\{\{[\s\S]*\}\}$/,
  "Must be a GitHub Actions expression (${{ ... }})"
);

/**
 * Values allowed in env/with blocks: string, number, or boolean.
 * Also allows expression strings.
 */
const EnvValue = z.union([z.string(), z.number(), z.boolean()]);

/**
 * An env/with block: either an object of key→value or a single expression string.
 * Matches the SchemaStore #/definitions/env.
 */
const EnvBlock = z.union([z.record(EnvValue), ExpressionSyntax]);

/**
 * Schema for the claude-code-action step configuration.
 * Strict — rejects unknown keys to catch typos.
 */
export const ActionSchema = z
  .object({
    prompt: z.string().min(1, "Action prompt cannot be empty"),
    claude_args: z.string().optional(),
    plugins: z.string().optional(),
    track_progress: z.boolean().optional(),
  })
  .strict();

/**
 * Schema for a GitHub Actions step (pre/post action steps).
 * Matches the SchemaStore github-workflow.json #/definitions/step.
 *
 * Key constraints from the spec:
 * - additionalProperties: false (strict)
 * - oneOf: exactly one of `uses` or `run` (XOR)
 * - dependencies: `shell` and `working-directory` require `run`
 */
export const GhaStepSchema = z
  .object({
    id: z.string().optional(),
    if: z.union([z.boolean(), z.number(), z.string()]).optional(),
    name: z.string().optional(),
    uses: z.string().optional(),
    run: z.string().optional(),
    "working-directory": z.string().optional(),
    shell: z.string().optional(),
    with: EnvBlock.optional(),
    env: EnvBlock.optional(),
    "continue-on-error": z.union([z.boolean(), ExpressionSyntax]).optional(),
    "timeout-minutes": z.union([z.number(), ExpressionSyntax]).optional(),
  })
  .strict()
  .superRefine((step, ctx) => {
    const hasUses = step.uses !== undefined;
    const hasRun = step.run !== undefined;

    // XOR: exactly one of uses or run
    if (!hasUses && !hasRun) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each step must have either 'uses' or 'run'",
      });
    } else if (hasUses && hasRun) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A step cannot have both 'uses' and 'run'",
      });
    }

    // Dependencies: shell and working-directory require run
    if (step.shell !== undefined && !hasRun) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "'shell' can only be used with 'run' steps",
        path: ["shell"],
      });
    }
    if (step["working-directory"] !== undefined && !hasRun) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "'working-directory' can only be used with 'run' steps",
        path: ["working-directory"],
      });
    }
  });

/**
 * Schema for checkout step configuration.
 * Passthrough — allows any actions/checkout args.
 */
export const CheckoutSchema = z.record(z.unknown()).optional();

/**
 * The main taskmaster spec schema.
 * Strict on the root — rejects unknown keys.
 */
export const TaskmasterSpecSchema = z
  .object({
    name: z.string().min(1, "Task name cannot be empty"),
    description: z.string().optional(),
    action: ActionSchema,
    checkout: CheckoutSchema,
    pre_action_steps: z.array(GhaStepSchema).optional(),
    post_action_steps: z.array(GhaStepSchema).optional(),
  })
  .strict();

export type TaskmasterSpec = z.infer<typeof TaskmasterSpecSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type GhaStep = z.infer<typeof GhaStepSchema>;
