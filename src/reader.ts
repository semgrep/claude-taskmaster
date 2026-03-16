import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

export interface RawSpec {
  filename: string;
  taskName: string;
  data: unknown;
}

export interface ReadResult {
  specs: RawSpec[];
  defaultPrompt: string | null;
}

/**
 * Derives a task name from a YAML filename.
 * e.g. "code-review.yml" → "code-review"
 */
function taskNameFromFilename(filename: string): string {
  return filename.replace(/\.ya?ml$/i, "");
}

/**
 * Reads all YAML spec files and an optional DEFAULT.md from the input directory.
 */
export async function readInputDir(inputDir: string): Promise<ReadResult> {
  const entries = await readdir(inputDir);

  let defaultPrompt: string | null = null;
  const specs: RawSpec[] = [];

  for (const entry of entries) {
    const fullPath = join(inputDir, entry);

    if (entry === "DEFAULT.md") {
      defaultPrompt = await Bun.file(fullPath).text();
      continue;
    }

    if (/\.ya?ml$/i.test(entry)) {
      const content = await Bun.file(fullPath).text();
      const data = parseYaml(content);
      specs.push({
        filename: entry,
        taskName: taskNameFromFilename(entry),
        data,
      });
    }
  }

  return { specs, defaultPrompt };
}
