import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { gt, prerelease, valid } from "semver";
import { defaultConfigPath } from "./config.js";
import { VERSION } from "./help.js";
import { hasFlag, parseArgv } from "./parser.js";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const NOTIFICATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 2_500;
const FINISH_GRACE_MS = 300;
const REGISTRY_URL = "https://registry.npmjs.org/@bisibility%2fcli/latest";

type UpdateCache = {
  lastCheck: number;
  lastNotified?: number;
  latestVersion: string;
};

export type UpdateCheckOptions = {
  cachePath?: string;
  currentVersion?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  finishGraceMs?: number;
  isStderrTTY?: boolean;
  now?: () => Date;
  timeoutMs?: number;
};

export type UpdateCheckSession = {
  finish: (notified: boolean) => Promise<void>;
  notification: string | null;
};

function isEnabledEnvironmentValue(value: string | undefined) {
  return value !== undefined && value !== "" && value !== "0" && value.toLowerCase() !== "false";
}

function shouldSuppress(argv: readonly string[], options: UpdateCheckOptions) {
  const env = options.env ?? process.env;
  if (!options.isStderrTTY) return true;
  if (isEnabledEnvironmentValue(env.BISIBILITY_NO_UPDATE_CHECK)) return true;
  if (isEnabledEnvironmentValue(env.NO_UPDATE_NOTIFIER)) return true;
  if (isEnabledEnvironmentValue(env.CI)) return true;
  try {
    const args = parseArgv(argv);
    if (hasFlag(args, "json") || hasFlag(args, "help") || hasFlag(args, "version")) return true;
    return args.positionals[0] === "upgrade";
  } catch {
    return true;
  }
}

function resolveCachePath(argv: readonly string[], options: UpdateCheckOptions) {
  if (options.cachePath) return options.cachePath;
  const env = options.env ?? process.env;
  try {
    const configPath = defaultConfigPath(parseArgv(argv), { env, homeDir: homedir() });
    return join(dirname(configPath), "update-check.json");
  } catch {
    return join(homedir(), ".config", "bisibility", "update-check.json");
  }
}

function cacheFrom(value: unknown): UpdateCache | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!Number.isFinite(candidate.lastCheck)) return null;
  if (typeof candidate.latestVersion !== "string") return null;
  if (candidate.lastNotified !== undefined && !Number.isFinite(candidate.lastNotified)) return null;
  return {
    lastCheck: candidate.lastCheck as number,
    ...(candidate.lastNotified === undefined
      ? {}
      : { lastNotified: candidate.lastNotified as number }),
    latestVersion: candidate.latestVersion,
  };
}

function readCacheSync(cachePath: string) {
  try {
    return cacheFrom(JSON.parse(readFileSync(cachePath, "utf8")));
  } catch {
    return null;
  }
}

async function readCache(cachePath: string) {
  try {
    return cacheFrom(JSON.parse(await readFile(cachePath, "utf8")));
  } catch {
    return null;
  }
}

async function writeCache(cachePath: string, cache: UpdateCache) {
  const directory = dirname(cachePath);
  const temporaryPath = join(directory, `.update-check.${process.pid}.${randomUUID()}.tmp`);
  await mkdir(directory, { mode: 0o700, recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(cache)}\n`, { mode: 0o600 });
    await rename(temporaryPath, cachePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

function stableVersion(value: string) {
  const normalized = valid(value);
  return normalized && prerelease(normalized) === null ? normalized : null;
}

function notificationFrom(cache: UpdateCache | null, currentVersion: string, nowMs: number) {
  if (!cache) return null;
  const current = stableVersion(currentVersion);
  const latest = stableVersion(cache.latestVersion);
  if (!current || !latest || !gt(latest, current)) return null;
  if (cache.lastNotified !== undefined && nowMs - cache.lastNotified < NOTIFICATION_INTERVAL_MS) {
    return null;
  }
  return `Update available: ${current} -> ${latest}  Run "bisibility upgrade" to update.\n`;
}

async function refreshCache(
  cachePath: string,
  previous: UpdateCache | null,
  options: UpdateCheckOptions,
  controller: AbortController,
) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  timeout.unref();
  try {
    const response = await fetchImpl(REGISTRY_URL, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return;
    const body = (await response.json()) as { version?: unknown };
    if (typeof body.version !== "string") return;
    const latestVersion = stableVersion(body.version);
    if (!latestVersion) return;
    await writeCache(cachePath, {
      lastCheck: now().getTime(),
      ...(previous?.lastNotified === undefined ? {} : { lastNotified: previous.lastNotified }),
      latestVersion,
    });
  } catch {
    // Update checks are best-effort and must never affect CLI commands.
  } finally {
    clearTimeout(timeout);
  }
}

async function finishRefresh(refresh: Promise<void>, controller: AbortController, graceMs: number) {
  let graceTimer: NodeJS.Timeout | undefined;
  const finishedWithinGrace = await Promise.race([
    refresh.then(() => true),
    new Promise<boolean>((resolve) => {
      graceTimer = setTimeout(() => resolve(false), graceMs);
    }),
  ]);
  if (graceTimer) clearTimeout(graceTimer);
  if (!finishedWithinGrace) controller.abort();
  await refresh;
}

export function startUpdateCheck(
  argv: readonly string[],
  options: UpdateCheckOptions = {},
): UpdateCheckSession {
  if (shouldSuppress(argv, options)) {
    return { finish: async () => undefined, notification: null };
  }

  const cachePath = resolveCachePath(argv, options);
  const now = options.now ?? (() => new Date());
  const nowMs = now().getTime();
  const previous = readCacheSync(cachePath);
  const notification = notificationFrom(previous, options.currentVersion ?? VERSION, nowMs);
  const shouldRefresh = !previous || nowMs - previous.lastCheck >= CHECK_INTERVAL_MS;
  const controller = new AbortController();
  const refresh = shouldRefresh
    ? refreshCache(cachePath, previous, options, controller)
    : Promise.resolve();
  let finished = false;

  return {
    async finish(notified: boolean) {
      if (finished) return;
      finished = true;
      await finishRefresh(refresh, controller, options.finishGraceMs ?? FINISH_GRACE_MS);
      if (!notified || !notification) return;
      try {
        // Bookkeeping stays lock-free: atomic renames prevent corruption, while a rare concurrent
        // process may win this read-modify-write and cause an extra notification later.
        const current = (await readCache(cachePath)) ?? previous;
        if (!current) return;
        await writeCache(cachePath, { ...current, lastNotified: now().getTime() });
      } catch {
        // Notification bookkeeping is also best-effort.
      }
    },
    notification,
  };
}
