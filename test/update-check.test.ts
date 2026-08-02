import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startUpdateCheck } from "../src/update-check.js";

const roots: string[] = [];
const now = new Date("2026-08-02T12:00:00.000Z");

async function cachePath() {
  const root = join(tmpdir(), `bisibility-update-${crypto.randomUUID()}`);
  roots.push(root);
  await mkdir(root, { recursive: true });
  return join(root, "update-check.json");
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(async (root) => {
      const { rm } = await import("node:fs/promises");
      await rm(root, { force: true, recursive: true });
    }),
  );
});

describe("update checker", () => {
  it("shows a cached update once per day and refreshes the cache atomically", async () => {
    const path = await cachePath();
    await writeFile(
      path,
      JSON.stringify({
        lastCheck: now.getTime() - 25 * 60 * 60 * 1000,
        latestVersion: "0.10.0",
      }),
    );
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ version: "0.11.0" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    const session = startUpdateCheck(["projects", "list"], {
      cachePath: path,
      currentVersion: "0.9.0",
      env: {},
      fetch,
      isStderrTTY: true,
      now: () => now,
    });

    expect(session.notification).toBe(
      'Update available: 0.9.0 -> 0.10.0  Run "bisibility upgrade" to update.\n',
    );
    await session.finish(true);

    expect(fetch).toHaveBeenCalledWith(
      "https://registry.npmjs.org/@bisibility%2fcli/latest",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    const cached = JSON.parse(await readFile(path, "utf8"));
    expect(cached).toEqual({
      lastCheck: now.getTime(),
      lastNotified: now.getTime(),
      latestVersion: "0.11.0",
    });
    expect((await readdir(join(path, ".."))).filter((name) => name.includes(".tmp"))).toEqual([]);
  });

  it("does not repeat a recent notification or show prereleases", async () => {
    const path = await cachePath();
    await writeFile(
      path,
      JSON.stringify({
        lastCheck: now.getTime(),
        lastNotified: now.getTime() - 60 * 60 * 1000,
        latestVersion: "1.0.0-beta.1",
      }),
    );

    const session = startUpdateCheck(["projects", "list"], {
      cachePath: path,
      currentVersion: "0.9.0",
      env: {},
      fetch: vi.fn(),
      isStderrTTY: true,
      now: () => now,
    });

    expect(session.notification).toBeNull();
    await expect(session.finish(false)).resolves.toBeUndefined();
  });

  it("rate-limits a stable cached update and lets finish be called twice", async () => {
    const path = await cachePath();
    await writeFile(
      path,
      JSON.stringify({
        lastCheck: now.getTime(),
        lastNotified: now.getTime() - 60 * 60 * 1000,
        latestVersion: "1.0.0",
      }),
    );
    const session = startUpdateCheck(["projects", "list"], {
      cachePath: path,
      currentVersion: "0.9.0",
      env: {},
      fetch: vi.fn(),
      isStderrTTY: true,
      now: () => now,
    });

    expect(session.notification).toBeNull();
    await session.finish(false);
    await expect(session.finish(false)).resolves.toBeUndefined();
  });

  it("preserves the cached update if the file disappears before notification bookkeeping", async () => {
    const path = await cachePath();
    await writeFile(path, JSON.stringify({ lastCheck: now.getTime(), latestVersion: "1.0.0" }));
    const session = startUpdateCheck(["projects", "list"], {
      cachePath: path,
      currentVersion: "0.9.0",
      env: {},
      fetch: vi.fn(),
      isStderrTTY: true,
      now: () => now,
    });
    await rm(path);

    await session.finish(true);

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      lastCheck: now.getTime(),
      lastNotified: now.getTime(),
      latestVersion: "1.0.0",
    });
  });

  it.each([
    { argv: ["projects", "list", "--json"], env: {}, isStderrTTY: true },
    { argv: ["--help"], env: {}, isStderrTTY: true },
    { argv: ["-h"], env: {}, isStderrTTY: true },
    { argv: ["--version"], env: {}, isStderrTTY: true },
    { argv: ["-v"], env: {}, isStderrTTY: true },
    { argv: ["--unknown-option"], env: {}, isStderrTTY: true },
    { argv: ["upgrade"], env: {}, isStderrTTY: true },
    { argv: ["projects", "list"], env: { CI: "true" }, isStderrTTY: true },
    {
      argv: ["projects", "list"],
      env: { BISIBILITY_NO_UPDATE_CHECK: "1" },
      isStderrTTY: true,
    },
    {
      argv: ["projects", "list"],
      env: { NO_UPDATE_NOTIFIER: "1" },
      isStderrTTY: true,
    },
    { argv: ["projects", "list"], env: {}, isStderrTTY: false },
  ])("suppresses automated checks for %#", async ({ argv, env, isStderrTTY }) => {
    const fetch = vi.fn();
    const session = startUpdateCheck(argv, {
      cachePath: await cachePath(),
      currentVersion: "0.9.0",
      env,
      fetch,
      isStderrTTY,
      now: () => now,
    });

    expect(session.notification).toBeNull();
    await session.finish(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("treats conventional false opt-out values as enabled checks", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    const session = startUpdateCheck(["projects", "list"], {
      cachePath: await cachePath(),
      currentVersion: "0.9.0",
      env: { BISIBILITY_NO_UPDATE_CHECK: "", CI: "false", NO_UPDATE_NOTIFIER: "0" },
      fetch,
      isStderrTTY: true,
      now: () => now,
    });

    await session.finish(false);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not treat a positional --json after the option terminator as a flag", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    const session = startUpdateCheck(["projects", "list", "--", "--json"], {
      cachePath: await cachePath(),
      currentVersion: "0.9.0",
      env: {},
      fetch,
      isStderrTTY: true,
      now: () => now,
    });

    await session.finish(false);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("allows a fast registry refresh to finish before aborting it", async () => {
    const path = await cachePath();
    let resolveFetch: (response: Response) => void = () => undefined;
    const fetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          resolveFetch = resolve;
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const session = startUpdateCheck(["projects", "list"], {
      cachePath: path,
      currentVersion: "0.9.0",
      env: {},
      fetch,
      finishGraceMs: 50,
      isStderrTTY: true,
      now: () => now,
    });

    const finishing = session.finish(false);
    resolveFetch(
      new Response(JSON.stringify({ version: "0.4.0" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    await finishing;

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      lastCheck: now.getTime(),
      latestVersion: "0.4.0",
    });
  });

  it("aborts a registry refresh after the finish grace period", async () => {
    let signal: AbortSignal | undefined;
    const fetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal ?? undefined;
          signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const session = startUpdateCheck(["projects", "list"], {
      cachePath: await cachePath(),
      currentVersion: "0.9.0",
      env: {},
      fetch,
      finishGraceMs: 1,
      isStderrTTY: true,
      now: () => now,
    });

    await expect(session.finish(false)).resolves.toBeUndefined();
    expect(signal?.aborted).toBe(true);
  });

  it("places the default cache beside BISIBILITY_CONFIG", async () => {
    const root = join(tmpdir(), `bisibility-update-config-${crypto.randomUUID()}`);
    roots.push(root);
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    const session = startUpdateCheck(["projects", "list"], {
      currentVersion: "0.9.0",
      env: { BISIBILITY_CONFIG: join(root, "config.json") },
      fetch,
      isStderrTTY: true,
      now: () => now,
    });

    await session.finish(false);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([401, 404])("ignores corrupt cache files and HTTP %s responses", async (status) => {
    const corruptPath = await cachePath();
    await writeFile(corruptPath, "{not-json");
    const httpError = startUpdateCheck(["projects", "list"], {
      cachePath: corruptPath,
      currentVersion: "0.9.0",
      env: {},
      fetch: vi.fn().mockResolvedValue(new Response(null, { status })),
      isStderrTTY: true,
      now: () => now,
    });

    expect(httpError.notification).toBeNull();
    await expect(httpError.finish(false)).resolves.toBeUndefined();
  });

  it("ignores aborted update requests", async () => {
    const timeout = startUpdateCheck(["projects", "list"], {
      cachePath: await cachePath(),
      currentVersion: "0.9.0",
      env: {},
      fetch: vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")),
      isStderrTTY: true,
      now: () => now,
    });
    await expect(timeout.finish(false)).resolves.toBeUndefined();
  });
});
