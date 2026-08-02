import { runCli } from "./cli.js";
import { startUpdateCheck } from "./update-check.js";

type TextSink = {
  isTTY?: boolean;
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
  const updateCheck = startUpdateCheck(argv, { isStderrTTY: Boolean(output.stderr.isTTY) });
  const result = await runCli(argv, {
    onProgress: (message) => output.stderr.write(message),
  });

  if (result.stdout) {
    output.stdout.write(result.stdout);
  }
  if (result.stderr) {
    output.stderr.write(result.stderr);
  }

  const shouldNotify = result.exitCode === 0 && updateCheck.notification !== null;
  await updateCheck.finish(shouldNotify);
  if (shouldNotify && updateCheck.notification) {
    output.stderr.write(updateCheck.notification);
  }

  return result.exitCode;
}
