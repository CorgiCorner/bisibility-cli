import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { ParsedArgs } from "./parser.js";
import { getStringFlag } from "./parser.js";
import { type PublicIdForPrefix, assertPublicId } from "./public-id.js";

export const DEFAULT_BASE_URL = "https://eu.bisibility.com/api/v1";
export const DEFAULT_CLOUD_URL = "https://bisibility.com";
export const LOCAL_PROJECT_DIRECTORY = ".bisibility";
export const LOCAL_PROJECT_FILE = "project.json";
type ProjectId = PublicIdForPrefix<"prj">;

export type ApiCredentialSource = "command" | "config" | "environment" | "flag";
export type ProjectSelectionSource = "environment" | "flag" | "global" | "local";

export type ConfigFile = {
  apiKey?: string;
  baseUrl?: string;
  cloudUrl?: string;
  projectId?: string;
};

export type ResolvedSettings = {
  apiKey?: string;
  apiKeySource?: ApiCredentialSource;
  baseUrl: string;
  cloudUrl: string;
  config: ConfigFile;
  configPath: string;
  projectConfigPath?: string;
  projectId?: string;
  projectSource?: ProjectSelectionSource;
};

export type ProjectLink = {
  path: string;
  projectId: ProjectId;
};

export type ConfigDeps = {
  chmod?: typeof chmod;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  readFile?: typeof readFile;
  mkdir?: typeof mkdir;
  platform?: NodeJS.Platform;
  rm?: typeof rm;
  writeFile?: typeof writeFile;
};

const configKeys = new Set(["apiKey", "baseUrl", "cloudUrl", "projectId"]);
const API_CREDENTIAL_PREFIXES = ["bsb_key_live_", "bsb_key_test_", "bsb_pat_live_"] as const;

export function isApiCredential(value: string) {
  return API_CREDENTIAL_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function apiCredentialPrefix(value: string) {
  return /^[a-z][a-z0-9]{1,7}_/i.exec(value)?.[0];
}

export function assertApiCredential(
  value: string,
  source: ApiCredentialSource,
  configPath?: string,
) {
  if (isApiCredential(value)) {
    return value;
  }

  const prefix = apiCredentialPrefix(value);
  const problem = prefix ? `unsupported prefix "${prefix}"` : "unsupported format";
  if (source === "environment") {
    throw new Error(
      `Invalid API credential from BISIBILITY_API_KEY: ${problem}. Unset BISIBILITY_API_KEY or set a current credential.`,
    );
  }
  if (source === "flag") {
    throw new Error(
      `Invalid API credential from --api-key: ${problem}. Pass a current credential to --api-key, or remove the flag and run 'bisibility auth login'.`,
    );
  }
  if (source === "command") {
    throw new Error(
      `Invalid API credential passed to 'bisibility config set apiKey': ${problem}. Run 'bisibility auth login', or pass a supported credential.`,
    );
  }
  const configSource = configPath ? `config file "${configPath}"` : "the config file";
  throw new Error(
    `Invalid API credential from ${configSource}: ${problem}. Run 'bisibility auth login' to replace it.`,
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function expandHome(input: string, homeDir: string) {
  return input === "~" || input.startsWith("~/") ? join(homeDir, input.slice(2)) : input;
}

function absolutePath(input: string, cwd: string, homeDir: string) {
  const expanded = expandHome(input, homeDir);
  return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}

export function defaultConfigPath(args: ParsedArgs, deps: ConfigDeps = {}) {
  const env = deps.env ?? process.env;
  const cwd = deps.cwd ?? process.cwd();
  const homeDir = deps.homeDir ?? homedir();
  const configured = getStringFlag(args, "config") ?? env.BISIBILITY_CONFIG;
  if (configured) {
    return absolutePath(configured, cwd, homeDir);
  }
  return join(homeDir, ".config", "bisibility", "config.json");
}

export async function readConfigFile(args: ParsedArgs, deps: ConfigDeps = {}): Promise<ConfigFile> {
  const read = deps.readFile ?? readFile;
  const configPath = defaultConfigPath(args, deps);

  let raw: string;
  try {
    raw = await read(configPath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Config file ${configPath} must contain a JSON object.`);
  }

  const config: ConfigFile = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (configKeys.has(key) && typeof value === "string" && value.trim()) {
      config[key as keyof ConfigFile] = value;
    }
  }
  return config;
}

export async function writeConfigFile(args: ParsedArgs, config: ConfigFile, deps: ConfigDeps = {}) {
  const makeDir = deps.mkdir ?? mkdir;
  const write = deps.writeFile ?? writeFile;
  const configPath = defaultConfigPath(args, deps);
  const configDirectory = dirname(configPath);
  const usesDefaultDirectory =
    !getStringFlag(args, "config") && !(deps.env ?? process.env).BISIBILITY_CONFIG;
  const usePosixModes = (deps.platform ?? process.platform) !== "win32";
  const setMode = deps.chmod ?? chmod;

  await makeDir(configDirectory, { mode: 0o700, recursive: true });
  if (usePosixModes && usesDefaultDirectory) {
    await setMode(configDirectory, 0o700);
  }
  if (usePosixModes) {
    try {
      await setMode(configPath, 0o600);
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") throw error;
    }
  }
  await write(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  if (usePosixModes) {
    await setMode(configPath, 0o600);
  }
  return configPath;
}

function projectLinkFromJson(raw: string, path: string): ProjectLink {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Project link ${path} must contain valid JSON.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Project link ${path} must contain a JSON object.`);
  }
  const projectId = (parsed as { projectId?: unknown }).projectId;
  if (typeof projectId !== "string" || !projectId.trim()) {
    throw new Error(`Project link ${path} must contain a non-empty projectId.`);
  }
  return { path, projectId: assertPublicId(projectId.trim(), "prj", "Project ID") };
}

export async function findProjectLink(deps: ConfigDeps = {}): Promise<ProjectLink | null> {
  const read = deps.readFile ?? readFile;
  let directory = deps.cwd ?? process.cwd();

  while (true) {
    const path = join(directory, LOCAL_PROJECT_DIRECTORY, LOCAL_PROJECT_FILE);
    try {
      return projectLinkFromJson(await read(path, "utf8"), path);
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") {
        throw error;
      }
    }
    const parent = dirname(directory);
    if (parent === directory) {
      return null;
    }
    directory = parent;
  }
}

async function ensureProjectLinkIgnored(directory: string, deps: ConfigDeps) {
  const read = deps.readFile ?? readFile;
  const write = deps.writeFile ?? writeFile;
  const path = join(directory, ".gitignore");
  let contents = "";
  try {
    contents = await read(path, "utf8");
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }
  const lines = contents.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes(LOCAL_PROJECT_DIRECTORY) || lines.includes(`${LOCAL_PROJECT_DIRECTORY}/`)) {
    return path;
  }
  const prefix = contents && !contents.endsWith("\n") ? "\n" : "";
  await write(path, `${contents}${prefix}${LOCAL_PROJECT_DIRECTORY}/\n`, { mode: 0o644 });
  return path;
}

export async function writeProjectLink(projectId: ProjectId, deps: ConfigDeps = {}) {
  const makeDir = deps.mkdir ?? mkdir;
  const write = deps.writeFile ?? writeFile;
  const directory = deps.cwd ?? process.cwd();
  const linkDirectory = join(directory, LOCAL_PROJECT_DIRECTORY);
  const path = join(linkDirectory, LOCAL_PROJECT_FILE);
  await makeDir(linkDirectory, { recursive: true });
  await write(path, `${JSON.stringify({ projectId }, null, 2)}\n`, { mode: 0o600 });
  const gitignorePath = await ensureProjectLinkIgnored(directory, deps);
  return { gitignorePath, path };
}

export async function removeProjectLink(deps: ConfigDeps = {}) {
  const link = await findProjectLink(deps);
  if (!link) {
    return null;
  }
  await (deps.rm ?? rm)(link.path, { force: true });
  return link.path;
}

export async function loadSettings(
  args: ParsedArgs,
  deps: ConfigDeps = {},
): Promise<ResolvedSettings> {
  const env = deps.env ?? process.env;
  const configPath = defaultConfigPath(args, deps);
  const config = await readConfigFile(args, deps);
  const apiKeyFromFlag = getStringFlag(args, "api-key");
  const apiKeyFromEnvironment = env.BISIBILITY_API_KEY;
  const apiKey = apiKeyFromFlag ?? apiKeyFromEnvironment ?? config.apiKey;
  const apiKeySource: ApiCredentialSource | undefined = apiKeyFromFlag
    ? "flag"
    : apiKeyFromEnvironment
      ? "environment"
      : config.apiKey
        ? "config"
        : undefined;
  const baseUrl =
    getStringFlag(args, "base-url") ??
    env.BISIBILITY_BASE_URL ??
    config.baseUrl ??
    DEFAULT_BASE_URL;
  const cloudUrl =
    getStringFlag(args, "cloud-url") ??
    env.BISIBILITY_CLOUD_URL ??
    config.cloudUrl ??
    cloudUrlFromBaseUrl(baseUrl);
  const projectFromFlag = getStringFlag(args, "project");
  const projectFromEnvironment = env.BISIBILITY_PROJECT_ID;
  const projectLink =
    projectFromFlag || projectFromEnvironment ? null : await findProjectLink(deps);
  const projectId =
    projectFromFlag ?? projectFromEnvironment ?? projectLink?.projectId ?? config.projectId;
  const projectSource: ProjectSelectionSource | undefined = projectFromFlag
    ? "flag"
    : projectFromEnvironment
      ? "environment"
      : projectLink
        ? "local"
        : config.projectId
          ? "global"
          : undefined;

  if (projectId) {
    assertPublicId(projectId, "prj", "Configured project ID");
  }

  return {
    ...(apiKey ? { apiKey } : {}),
    ...(apiKeySource ? { apiKeySource } : {}),
    baseUrl,
    cloudUrl,
    config,
    configPath,
    ...(projectLink ? { projectConfigPath: projectLink.path } : {}),
    ...(projectId ? { projectId } : {}),
    ...(projectSource ? { projectSource } : {}),
  };
}

export function normalizeConfigKey(raw: string) {
  const key = raw.trim();
  if (key === "api-key") {
    return "apiKey";
  }
  if (key === "base-url") {
    return "baseUrl";
  }
  if (key === "cloud-url") {
    return "cloudUrl";
  }
  if (key === "project-id" || key === "project") {
    return "projectId";
  }
  if (configKeys.has(key)) {
    return key as keyof ConfigFile;
  }
  return null;
}

export function redactSecret(value: string | undefined) {
  if (!value) {
    return null;
  }
  if (value.length <= 10) {
    return "configured";
  }
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

export function cloudUrlFromBaseUrl(baseUrl: string) {
  try {
    if (baseUrl.replace(/\/$/, "") === DEFAULT_BASE_URL) {
      return DEFAULT_CLOUD_URL;
    }
    const url = new URL(baseUrl);
    if (url.pathname.endsWith("/api/v1")) {
      url.pathname = url.pathname.slice(0, -"/api/v1".length) || "/";
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/$/, "");
    }
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return DEFAULT_CLOUD_URL;
  }
}
