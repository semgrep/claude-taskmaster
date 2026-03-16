import { ZodError } from "zod";
import { TaskmasterSpecSchema, type TaskmasterSpec } from "./schema";
import type { RawSpec } from "./reader";

export interface ValidationError {
  filename: string;
  errors: string[];
}

export interface ValidationResult {
  valid: ValidatedSpec[];
  errors: ValidationError[];
}

export interface ValidatedSpec {
  filename: string;
  taskName: string;
  spec: TaskmasterSpec;
}

/**
 * Formats a ZodError into human-readable strings.
 */
function formatZodError(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `  ${path}: ${issue.message}`;
  });
}

/**
 * Validates an array of raw specs against the TaskmasterSpecSchema.
 * Collects all errors across all files before returning.
 */
export function validateSpecs(rawSpecs: RawSpec[]): ValidationResult {
  const valid: ValidatedSpec[] = [];
  const errors: ValidationError[] = [];

  for (const raw of rawSpecs) {
    const result = TaskmasterSpecSchema.safeParse(raw.data);

    if (result.success) {
      valid.push({
        filename: raw.filename,
        taskName: raw.taskName,
        spec: result.data,
      });
    } else {
      errors.push({
        filename: raw.filename,
        errors: formatZodError(result.error),
      });
    }
  }

  return { valid, errors };
}

/**
 * Formats validation errors into a single error message string.
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  const lines: string[] = ["Validation failed:"];

  for (const { filename, errors: fileErrors } of errors) {
    lines.push(`\n  ${filename}:`);
    lines.push(...fileErrors);
  }

  return lines.join("\n");
}
