import { runCli } from "./cli.js";

type TextSink = {
  write: (message: string) => unknown;
};

export type CliOutput = {
  stderr: TextSink;
  stdout: TextSink;
};

export async function executeCli(
  argv: readonly string[],
  output: CliOutput = { stderr: process.stderr, stdout: process.stdout },
) {
  const result = await runCli(argv, {
    onProgress: (message) => output.stderr.write(message),
  });

  if (result.stdout) {
    output.stdout.write(result.stdout);
  }
  if (result.stderr) {
    output.stderr.write(result.stderr);
  }

  return result.exitCode;
}
