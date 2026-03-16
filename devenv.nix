{ pkgs, ... }:

{
  languages.javascript = {
    enable = true;
    bun.enable = true;
  };

  scripts.test.exec = "bun test";
  scripts.build.exec = "bun run src/cli.ts";
  scripts.compile.exec = "bun build src/cli.ts --compile --outfile dist/claude-taskmaster";
}
