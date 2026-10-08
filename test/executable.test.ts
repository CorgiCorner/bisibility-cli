import { describe, expect, it, vi } from "vitest";

const cli = vi.hoisted(() => ({ runCli: vi.fn() }));
const updates = vi.hoisted(() => ({ startUpdateCheck: vi.fn() }));

vi.mock("../src/cli.js", () => ({ runCli: cli.runCli }));
vi.mock("../src/update-check.js", () => ({ startUpdateCheck: updates.startUpdateCheck }));

import { executeCli } from "../src/executable.js";

describe("CLI executable", () => {
  it("writes progress to stderr before the command result resolves", async () => {
    const stderr: string[] = [];
    const stdout: string[] = [];
    let finish: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    updates.startUpdateCheck.mockReturnValueOnce({
      finish: vi.fn().mockResolvedValue(undefined),
      notification: null,
    });
    cli.runCli.mockImplementationOnce(async (_argv, deps) => {
      deps.onProgress?.("Opening the default browser.\n");
      deps.onProgress?.("Waiting for authorization.\n");
      await pending;
      return { exitCode: 0, stderr: "", stdout: "done\n" };
    });

    const execution = executeCli(["auth", "login"], {
      stderr: { write: (message) => stderr.push(message) },
      stdout: { write: (message) => stdout.push(message) },
    });
    await vi.waitFor(() => {
      expect(stderr.join("")).toContain("Waiting for authorization.");
    });
    expect(stdout).toEqual([]);

    finish();
    await execution;
    expect(stdout).toEqual(["done\n"]);
  });

  it("prints a cached update notification after normal command output", async () => {
    const events: string[] = [];
    const finish = vi.fn().mockResolvedValue(undefined);
    updates.startUpdateCheck.mockReturnValueOnce({
      finish,
      notification: "Update available.\n",
    });
    cli.runCli.mockResolvedValueOnce({ exitCode: 0, stderr: "warning\n", stdout: "done\n" });

    await executeCli(["projects", "list"], {
      stderr: { isTTY: true, write: (message) => events.push(`stderr:${message}`) },
      stdout: { write: (message) => events.push(`stdout:${message}`) },
    });

    expect(events).toEqual(["stdout:done\n", "stderr:warning\n", "stderr:Update available.\n"]);
    expect(finish).toHaveBeenCalledWith(true);
  });

  it("does not print a cached update notification after a failed command", async () => {
    const stderr: string[] = [];
    const finish = vi.fn().mockResolvedValue(undefined);
    updates.startUpdateCheck.mockReturnValueOnce({
      finish,
      notification: "Update available.\n",
    });
    cli.runCli.mockResolvedValueOnce({ exitCode: 1, stderr: "failed\n", stdout: "" });

    await executeCli(["projects", "list"], {
      stderr: { isTTY: true, write: (message) => stderr.push(message) },
      stdout: { write: () => undefined },
    });

    expect(stderr).toEqual(["failed\n"]);
    expect(finish).toHaveBeenCalledWith(false);
  });
});
