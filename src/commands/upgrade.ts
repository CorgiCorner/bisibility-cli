import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { gt, prerelease, valid } from "semver";
import { CliError, type CommandContext } from "../context.js";
import { renderJson, renderKeyValues } from "../format.js";
import { VERSION } from "../help.js";
import { hasFlag } from "../parser.js";

const PACKAGE_NAME = "@bisibility/cli";
const REGISTRY_URL = "https://registry.npmjs.org/@bisibility%2fcli/latest";
const REQUEST_TIMEOUT_MS = 10_000;

export type InstallationMethod = "bun" | "npm" | "pnpm" | "unknown";

export type UpgradeCommand = {
  args: string[];
  command: string;
};

type RunProcessOptions = {
  commandShell?: string;
  platform?: NodeJS.Platform;
  spawn?: typeof spawn;
};

function normalizedPath(path: string) {
  return path.replaceAll("\\", "/").toLowerCase();
}

export function detectInstallationMethod(
  scriptPath = process.argv[1] ?? "",
  realpath: (path: string) => string = realpathSync,
): InstallationMethod {
  let resolved = scriptPath;
  try {
    resolved = realpath(scriptPath);
  } catch {
    // A replaced or removed executable can still be classified from its original path.
  }
  const path = normalizedPath(resolved);
  if (path.includes("/.bun/") || path.includes("/bun/install/global/")) return "bun";
  if (path.includes("/.pnpm/") || path.includes("/pnpm/global/")) return "pnpm";
  if (path.includes("/yarn/global/") || path.includes("/yarn/data/global/")) return "unknown";
  if (path.includes("/node_modules/")) return "npm";
  return "unknown";
}

export function upgradeCommandFor(
  method: InstallationMethod,
  latestVersion: string,
): UpgradeCommand | null {
  const packageSpec = `${PACKAGE_NAME}@${latestVersion}`;
  if (method === "npm") {
    return { args: ["install", "--global", packageSpec], command: "npm" };
  }
  if (method === "pnpm") {
    return { args: ["add", "--global", packageSpec], command: "pnpm" };
  }
  if (method === "bun") {
    return { args: ["install", "--global", packageSpec], command: "bun" };
  }
  return null;
}

const SAFE_WINDOWS_CMD_TOKEN = /^[A-Za-z0-9@_+=:,./\\-]+$/;

export function spawnInvocationForPlatform(
  command: string,
  args: readonly string[],
  platform: NodeJS.Platform = process.platform,
  commandShell = process.env.ComSpec ?? "cmd.exe",
): UpgradeCommand {
  if (platform !== "win32") return { args: [...args], command };
  if (command === "bun") return { args: [...args], command: "bun.exe" };
  if (command !== "npm" && command !== "pnpm") return { args: [...args], command };

  const tokens = [`${command}.cmd`, ...args];
  if (tokens.some((token) => !SAFE_WINDOWS_CMD_TOKEN.test(token))) {
    throw new CliError("Unsafe Windows package-manager argument.");
  }
  return {
    args: ["/d", "/s", "/c", tokens.join(" ")],
    command: commandShell,
  };
}

function commandText(command: UpgradeCommand | null) {
  return command ? [command.command, ...command.args].join(" ") : null;
}

async function latestStableVersion(fetchImpl: typeof globalThis.fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  timeout.unref();
  try {
    const response = await fetchImpl(REGISTRY_URL, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new CliError(`Could not check npm for updates (HTTP ${response.status}).`);
    }
    const body = (await response.json()) as { version?: unknown };
    const latest = typeof body.version === "string" ? valid(body.version) : null;
    if (!latest || prerelease(latest) !== null) {
      throw new CliError("The npm registry did not return a stable semantic version.");
    }
    return latest;
  } catch (error) {
    if (error instanceof CliError) throw error;
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new CliError(`Could not check npm for updates: ${message}.`);
  } finally {
    clearTimeout(timeout);
  }
}

export function runProcess(
  command: string,
  args: readonly string[],
  onOutput: (message: string) => void,
  options: RunProcessOptions = {},
) {
  const invocation = spawnInvocationForPlatform(
    command,
    args,
    options.platform ?? process.platform,
    options.commandShell ?? process.env.ComSpec ?? "cmd.exe",
  );
  const spawnProcess = options.spawn ?? spawn;
  return new Promise<number>((resolve, reject) => {
    const child = spawnProcess(invocation.command, invocation.args, {
      shell: false,
      stdio: ["inherit", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk: Buffer) => onOutput(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => onOutput(chunk.toString()));
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}

function manualInstallMessage() {
  return [
    "Could not determine how Bisibility CLI was installed.",
    "Run the command for the package manager that owns this installation:",
    `npm install --global ${PACKAGE_NAME}@latest`,
    `pnpm add --global ${PACKAGE_NAME}@latest`,
    `bun install --global ${PACKAGE_NAME}@latest`,
    `yarn global add ${PACKAGE_NAME}@latest`,
  ].join("\n");
}

export async function commandUpgrade(ctx: CommandContext, rest: readonly string[]) {
  if (rest.length > 0) throw new CliError("upgrade does not accept positional arguments.");
  const method = detectInstallationMethod(ctx.deps.scriptPath);
  const latestVersion = await latestStableVersion(ctx.deps.fetch ?? globalThis.fetch);
  const command = upgradeCommandFor(method, latestVersion);
  const updateAvailable = gt(latestVersion, VERSION);

  const result = {
    command: commandText(command),
    currentVersion: VERSION,
    installationMethod: method,
    latestVersion,
    updateAvailable,
  };

  if (hasFlag(ctx.args, "check")) {
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues([
          ["installation method", method],
          ["current version", VERSION],
          ["latest version", latestVersion],
          ["update available", updateAvailable ? "yes" : "no"],
          ["command", commandText(command)],
        ]);
  }

  if (!updateAvailable) {
    return hasFlag(ctx.args, "json")
      ? renderJson({ ...result, action: "up-to-date" })
      : `${PACKAGE_NAME} ${VERSION} is already up to date.\n`;
  }
  if (!command) throw new CliError(manualInstallMessage());

  ctx.progress(`Updating ${PACKAGE_NAME} via ${method}...\n`);
  const processRunner = ctx.deps.runProcess ?? runProcess;
  const exitCode = await processRunner(command.command, command.args, ctx.progress);
  if (exitCode !== 0) {
    throw new CliError(`${method} exited with status ${exitCode}; the CLI was not updated.`);
  }

  return hasFlag(ctx.args, "json")
    ? renderJson({ ...result, action: "updated" })
    : `Updated ${PACKAGE_NAME} from ${VERSION} to ${latestVersion}. Restart the CLI to use it.\n`;
}

export const handlers = { upgrade: commandUpgrade };
