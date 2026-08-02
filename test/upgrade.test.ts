import type { ChildProcessWithoutNullStreams, spawn as nodeSpawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { inc } from "semver";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";
import {
  detectInstallationMethod,
  runProcess,
  spawnInvocationForPlatform,
  upgradeCommandFor,
} from "../src/commands/upgrade.js";
import { VERSION } from "../src/help.js";

const NEWER_VERSION = inc(VERSION, "minor");
if (!NEWER_VERSION) throw new Error(`Could not derive a version newer than ${VERSION}.`);

const latestResponse = (version = NEWER_VERSION) =>
  new Response(JSON.stringify({ version }), {
    headers: { "content-type": "application/json" },
    status: 200,
  });

describe("upgrade command", () => {
  it.each([
    ["/home/test/Library/pnpm/global/5/node_modules/.pnpm/@bisibility+cli/dist/bin.js", "pnpm"],
    ["/home/test/.bun/install/global/node_modules/@bisibility/cli/dist/bin.js", "bun"],
    ["/home/test/.config/yarn/global/node_modules/@bisibility/cli/dist/bin.js", "unknown"],
    [
      "C:\\Users\\test\\AppData\\Local\\Yarn\\Data\\global\\node_modules\\@bisibility\\cli\\dist\\bin.js",
      "unknown",
    ],
    ["/usr/local/lib/node_modules/@bisibility/cli/dist/bin.js", "npm"],
    ["/home/test/bin/bisibility", "unknown"],
  ] as const)("detects %s as %s", (scriptPath, expected) => {
    expect(detectInstallationMethod(scriptPath, (path) => path)).toBe(expected);
  });

  it("falls back to the unresolved executable path", () => {
    expect(
      detectInstallationMethod(
        "C:\\Users\\test\\node_modules\\@bisibility\\cli\\dist\\bin.js",
        () => {
          throw new Error("missing");
        },
      ),
    ).toBe("npm");
    expect(detectInstallationMethod()).toMatch(/^(bun|npm|pnpm|unknown)$/);
  });

  it("maps supported package managers to argument arrays without a shell", () => {
    expect(upgradeCommandFor("npm", "0.4.0")).toEqual({
      args: ["install", "--global", "@bisibility/cli@0.4.0"],
      command: "npm",
    });
    expect(upgradeCommandFor("pnpm", "0.4.0")).toEqual({
      args: ["add", "--global", "@bisibility/cli@0.4.0"],
      command: "pnpm",
    });
    expect(upgradeCommandFor("bun", "0.4.0")).toEqual({
      args: ["install", "--global", "@bisibility/cli@0.4.0"],
      command: "bun",
    });
    expect(upgradeCommandFor("unknown", "0.4.0")).toBeNull();
  });

  it("runs Windows command shims through cmd.exe without enabling a spawn shell", () => {
    expect(
      spawnInvocationForPlatform(
        "npm",
        ["install", "--global", "@bisibility/cli@0.4.0"],
        "win32",
        "C:\\Windows\\System32\\cmd.exe",
      ),
    ).toEqual({
      args: ["/d", "/s", "/c", "npm.cmd install --global @bisibility/cli@0.4.0"],
      command: "C:\\Windows\\System32\\cmd.exe",
    });
    expect(
      spawnInvocationForPlatform("pnpm", ["add", "--global", "@bisibility/cli@0.4.0"], "win32"),
    ).toEqual({
      args: ["/d", "/s", "/c", "pnpm.cmd add --global @bisibility/cli@0.4.0"],
      command: "cmd.exe",
    });
    expect(spawnInvocationForPlatform("bun", ["--version"], "win32")).toEqual({
      args: ["--version"],
      command: "bun.exe",
    });
    expect(spawnInvocationForPlatform("node.exe", ["--version"], "win32")).toEqual({
      args: ["--version"],
      command: "node.exe",
    });
    expect(spawnInvocationForPlatform("npm", ["--version"], "darwin")).toEqual({
      args: ["--version"],
      command: "npm",
    });
    expect(() => spawnInvocationForPlatform("npm", ["install", "&whoami"], "win32")).toThrow(
      "Unsafe Windows package-manager argument",
    );
  });

  it("runs argument arrays and forwards both output streams", async () => {
    const output: string[] = [];
    const exitCode = await runProcess(
      process.execPath,
      ["-e", 'process.stdout.write("stdout\\n"); process.stderr.write("stderr\\n")'],
      (message) => output.push(message),
    );

    expect(exitCode).toBe(0);
    expect(output.sort()).toEqual(["stderr\n", "stdout\n"]);
  });

  it("routes npm through cmd.exe in the actual Windows process runner", async () => {
    const child = Object.assign(new EventEmitter(), {
      stderr: new EventEmitter(),
      stdin: new EventEmitter(),
      stdout: new EventEmitter(),
    }) as unknown as ChildProcessWithoutNullStreams;
    const spawn = vi.fn(() => child) as unknown as typeof nodeSpawn;
    const running = runProcess(
      "npm",
      ["install", "--global", "@bisibility/cli@0.4.0"],
      () => undefined,
      {
        commandShell: "C:\\Windows\\System32\\cmd.exe",
        platform: "win32",
        spawn,
      },
    );

    expect(spawn).toHaveBeenCalledWith(
      "C:\\Windows\\System32\\cmd.exe",
      ["/d", "/s", "/c", "npm.cmd install --global @bisibility/cli@0.4.0"],
      { shell: false, stdio: ["inherit", "pipe", "pipe"] },
    );
    child.emit("close", 0);
    await expect(running).resolves.toBe(0);
  });

  it("checks the latest stable version without changing the installation", async () => {
    const runProcess = vi.fn();
    const result = await runCli(["upgrade", "--check"], {
      fetch: vi.fn().mockResolvedValue(latestResponse()),
      runProcess,
      scriptPath: "/home/test/Library/pnpm/global/node_modules/@bisibility/cli/dist/bin.js",
    });

    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(result.stdout).toContain("installation method  pnpm");
    expect(result.stdout).toContain(`current version      ${VERSION}`);
    expect(result.stdout).toContain(`latest version       ${NEWER_VERSION}`);
    expect(result.stdout).toContain("update available     yes");
    expect(result.stdout).toContain(`pnpm add --global @bisibility/cli@${NEWER_VERSION}`);
    expect(runProcess).not.toHaveBeenCalled();
  });

  it("returns machine-readable check results", async () => {
    const result = await runCli(["upgrade", "--check", "--json"], {
      fetch: vi.fn().mockResolvedValue(latestResponse()),
      scriptPath: "/usr/local/lib/node_modules/@bisibility/cli/dist/bin.js",
    });

    expect(JSON.parse(result.stdout)).toEqual({
      command: `npm install --global @bisibility/cli@${NEWER_VERSION}`,
      currentVersion: VERSION,
      installationMethod: "npm",
      latestVersion: NEWER_VERSION,
      updateAvailable: true,
    });
  });

  it("reports a current version in human check output", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(latestResponse(VERSION));

    const result = await runCli(["upgrade", "--check"], {
      scriptPath: "/usr/local/lib/node_modules/@bisibility/cli/dist/bin.js",
    });

    expect(result.stdout).toContain("update available     no");
    fetch.mockRestore();
  });

  it("upgrades through the detected manager and streams package-manager output", async () => {
    const runProcess = vi.fn(async (_command, _args, onOutput) => {
      onOutput("Packages: +1\n");
      return 0;
    });
    const progress: string[] = [];
    const result = await runCli(["upgrade"], {
      fetch: vi.fn().mockResolvedValue(latestResponse()),
      onProgress: (message) => progress.push(message),
      runProcess,
      scriptPath: "/home/test/.bun/install/global/node_modules/@bisibility/cli/dist/bin.js",
    });

    expect(runProcess).toHaveBeenCalledWith(
      "bun",
      ["install", "--global", `@bisibility/cli@${NEWER_VERSION}`],
      expect.any(Function),
    );
    expect(progress.join("")).toContain("Updating @bisibility/cli via bun");
    expect(progress.join("")).toContain("Packages: +1");
    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: `Updated @bisibility/cli from ${VERSION} to ${NEWER_VERSION}. Restart the CLI to use it.\n`,
    });
  });

  it("refuses to mutate an installation when its manager is unknown", async () => {
    const runProcess = vi.fn();
    const result = await runCli(["upgrade"], {
      fetch: vi.fn().mockResolvedValue(latestResponse()),
      runProcess,
      scriptPath: "/home/test/bin/bisibility",
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Could not determine how Bisibility CLI was installed");
    expect(result.stderr).toContain("npm install --global @bisibility/cli@latest");
    expect(result.stderr).toContain("yarn global add @bisibility/cli@latest");
    expect(runProcess).not.toHaveBeenCalled();
  });

  it("reports package-manager failures without claiming an update", async () => {
    const result = await runCli(["upgrade"], {
      fetch: vi.fn().mockResolvedValue(latestResponse()),
      runProcess: vi.fn().mockResolvedValue(7),
      scriptPath: "/usr/local/lib/node_modules/@bisibility/cli/dist/bin.js",
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("npm exited with status 7; the CLI was not updated");
    expect(result.stdout).toBe("");
  });

  it("returns machine-readable updated and current results", async () => {
    const updated = await runCli(["upgrade", "--json"], {
      fetch: vi.fn().mockResolvedValue(latestResponse()),
      runProcess: vi.fn().mockResolvedValue(0),
      scriptPath: "/usr/local/lib/node_modules/@bisibility/cli/dist/bin.js",
    });
    const current = await runCli(["upgrade", "--json"], {
      fetch: vi.fn().mockResolvedValue(latestResponse(VERSION)),
      runProcess: vi.fn(),
      scriptPath: "/usr/local/lib/node_modules/@bisibility/cli/dist/bin.js",
    });

    expect(JSON.parse(updated.stdout).action).toBe("updated");
    expect(JSON.parse(current.stdout).action).toBe("up-to-date");
  });

  it("surfaces registry failures and rejects positional versions", async () => {
    const registryFailure = await runCli(["upgrade", "--check"], {
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
      scriptPath: "/usr/local/lib/node_modules/@bisibility/cli/dist/bin.js",
    });
    const positional = await runCli(["upgrade", "0.4.0"], {
      fetch: vi.fn(),
      scriptPath: "/usr/local/lib/node_modules/@bisibility/cli/dist/bin.js",
    });

    expect(registryFailure.stderr).toContain("Could not check npm for updates (HTTP 503)");
    expect(positional.stderr).toContain("upgrade does not accept positional arguments");
  });

  it("normalizes network and invalid-metadata errors", async () => {
    const networkFailure = await runCli(["upgrade", "--check"], {
      fetch: vi.fn().mockRejectedValue(new Error("offline")),
      scriptPath: "/usr/local/lib/node_modules/@bisibility/cli/dist/bin.js",
    });
    const unknownFailure = await runCli(["upgrade", "--check"], {
      fetch: vi.fn().mockRejectedValue("offline"),
      scriptPath: "/usr/local/lib/node_modules/@bisibility/cli/dist/bin.js",
    });
    const invalidMetadata = await runCli(["upgrade", "--check"], {
      fetch: vi.fn().mockResolvedValue(latestResponse("not-semver")),
      scriptPath: "/usr/local/lib/node_modules/@bisibility/cli/dist/bin.js",
    });
    const nonStringMetadata = await runCli(["upgrade", "--check"], {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ version: 4 }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      ),
      scriptPath: "/usr/local/lib/node_modules/@bisibility/cli/dist/bin.js",
    });

    expect(networkFailure.stderr).toContain("Could not check npm for updates: offline");
    expect(unknownFailure.stderr).toContain("Could not check npm for updates: Unknown error");
    expect(invalidMetadata.stderr).toContain("did not return a stable semantic version");
    expect(nonStringMetadata.stderr).toContain("did not return a stable semantic version");
  });

  it("does not run an installer when already current and rejects prerelease metadata", async () => {
    const runProcess = vi.fn();
    const current = await runCli(["upgrade"], {
      fetch: vi.fn().mockResolvedValue(latestResponse(VERSION)),
      runProcess,
      scriptPath: "/usr/local/lib/node_modules/@bisibility/cli/dist/bin.js",
    });
    const prerelease = await runCli(["upgrade", "--check"], {
      fetch: vi.fn().mockResolvedValue(latestResponse(`${NEWER_VERSION}-beta.1`)),
      runProcess,
      scriptPath: "/usr/local/lib/node_modules/@bisibility/cli/dist/bin.js",
    });

    expect(current.stdout).toBe(`@bisibility/cli ${VERSION} is already up to date.\n`);
    expect(prerelease.exitCode).toBe(1);
    expect(prerelease.stderr).toContain("npm registry did not return a stable semantic version");
    expect(runProcess).not.toHaveBeenCalled();
  });
});
