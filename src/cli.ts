#!/usr/bin/env bun

import { readInputDir } from "./reader";
import { validateSpecs, formatValidationErrors } from "./validator";
import {
  generateWorkflow,
  generateDispatcher,
  writeWorkflowFile,
} from "./generator";

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let actionVersion: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--action-version") {
      actionVersion = argv[++i];
      if (!actionVersion) {
        console.error("Error: --action-version requires a value");
        process.exit(1);
      }
    } else if (argv[i].startsWith("--action-version=")) {
      actionVersion = argv[i].split("=", 2)[1];
    } else {
      positional.push(argv[i]);
    }
  }

  return { positional, actionVersion };
}

async function main() {
  const { positional, actionVersion: flagVersion } = parseArgs(
    process.argv.slice(2)
  );

  if (positional.length < 2) {
    console.error(
      "Usage: taskmaster [--action-version <version>] <input-dir> <output-dir>"
    );
    process.exit(1);
  }

  const [inputDir, outputDir] = positional;
  const actionVersion =
    flagVersion || process.env.TASKMASTER_ACTION_VERSION || "v1";

  // Read
  console.log(`Reading specs from ${inputDir}...`);
  const { specs, systemPrompt } = await readInputDir(inputDir);

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
    const workflow = generateWorkflow(spec, systemPrompt, actionVersion);
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
