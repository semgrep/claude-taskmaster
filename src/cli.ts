#!/usr/bin/env bun

import { readInputDir } from "./reader";
import { validateSpecs, formatValidationErrors } from "./validator";
import {
  generateWorkflow,
  generateDispatcher,
  writeWorkflowFile,
} from "./generator";

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("Usage: taskmaster <input-dir> <output-dir>");
    process.exit(1);
  }

  const [inputDir, outputDir] = args;
  const actionVersion = process.env.TASKMASTER_ACTION_VERSION || "v1";

  // Read
  console.log(`Reading specs from ${inputDir}...`);
  const { specs, defaultPrompt } = await readInputDir(inputDir);

  if (specs.length === 0) {
    console.error(`No YAML spec files found in ${inputDir}`);
    process.exit(1);
  }

  // Validate
  const { valid, errors } = validateSpecs(specs);

  if (errors.length > 0) {
    console.error(formatValidationErrors(errors));
    if (valid.length === 0) {
      process.exit(1);
    }
    console.warn(
      `\nProceeding with ${valid.length} valid spec(s), skipping ${errors.length} invalid.\n`
    );
  }

  // Generate & write workflows
  const written: string[] = [];

  for (const spec of valid) {
    const workflow = generateWorkflow(spec, defaultPrompt, actionVersion);
    const path = await writeWorkflowFile(
      outputDir,
      workflow.filename,
      workflow.content
    );
    written.push(path);
  }

  // Generate & write dispatcher
  const dispatcher = generateDispatcher(valid);
  const dispatcherPath = await writeWorkflowFile(
    outputDir,
    dispatcher.filename,
    dispatcher.content
  );
  written.push(dispatcherPath);

  console.log(`Generated ${written.length} workflow file(s):`);
  for (const path of written) {
    console.log(`  ${path}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
