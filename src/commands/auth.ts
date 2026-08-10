import { hostname } from "node:os";
import { BisibilityApiError, BisibilityClient } from "@bisibility/sdk";
import {
  assertApiCredential,
  loadSettings,
  readConfigFile,
  redactSecret,
  writeConfigFile,
} from "../config.js";
import { renderJson, renderKeyValues } from "../format.js";
import { loginWithPkce } from "../oauth.js";
import { type ParsedArgs, getStringFlag, hasFlag } from "../parser.js";

import { CliError, type Client, type CommandContext, settingsAndClient } from "../context.js";

export function authScope(args: ParsedArgs) {
  const scope = getStringFlag(args, "scope") ?? "admin";
  if (scope !== "read" && scope !== "write" && scope !== "admin") {
    throw new CliError("--scope must be read, write, or admin.");
  }
  return scope;
}

export function authExpiry(args: ParsedArgs) {
  const expires = getStringFlag(args, "expires") ?? "90";
  const expiresInDays = expires === "never" ? null : Number(expires);
  if (expiresInDays !== null && ![30, 90, 365].includes(expiresInDays)) {
    throw new CliError("--expires must be 30, 90, 365, or never.");
  }
  return expiresInDays as 30 | 90 | 365 | null;
}

function tokenCreationError(error: unknown) {
  const detail =
    error instanceof BisibilityApiError
      ? (error.problem?.detail ?? error.message)
      : error instanceof Error
        ? error.message
        : "Unknown error.";
  return new CliError(
    `Login succeeded in the browser, but the CLI could not create an API token: ${detail}`,
  );
}

export async function commandAuthLogin(ctx: CommandContext) {
  const settings = await loadSettings(ctx.args, ctx.deps);
  const scope = authScope(ctx.args);
  const expiresInDays = authExpiry(ctx.args);
  const name = getStringFlag(ctx.args, "name") ?? `CLI on ${(ctx.deps.hostName ?? hostname)()}`;
  const oauth = await loginWithPkce(settings.cloudUrl, {
    ...(ctx.deps.fetch ? { fetch: ctx.deps.fetch } : {}),
    onProgress: ctx.progress,
    ...(ctx.deps.openBrowser ? { openBrowser: ctx.deps.openBrowser } : {}),
    ...(ctx.deps.oauthTimeoutMs ? { timeoutMs: ctx.deps.oauthTimeoutMs } : {}),
  });
  let issued: Awaited<ReturnType<Client["account"]["tokens"]["create"]>>;
  try {
    const client = new BisibilityClient({
      accessToken: oauth.accessToken,
      baseUrl: settings.baseUrl,
      ...(ctx.deps.fetch ? { fetch: ctx.deps.fetch } : {}),
    });
    issued = await client.account.tokens.create({ expires_in_days: expiresInDays, name, scope });
  } catch (error) {
    throw tokenCreationError(error);
  }
  const next = { ...(await readConfigFile(ctx.args, ctx.deps)), apiKey: issued.token };
  const path = await writeConfigFile(ctx.args, next, ctx.deps);
  return hasFlag(ctx.args, "json")
    ? renderJson({ configPath: path, expiresAt: issued.expires_at, id: issued.id, name, scope })
    : `Authentication succeeded for ${new URL(settings.cloudUrl).origin}.\n${renderKeyValues([
        ["authenticated", "yes"],
        ["token", typeof issued.id === "string" ? issued.id : undefined],
        ["scope", scope],
        ["expires", typeof issued.expires_at === "string" ? issued.expires_at : undefined],
        ["config", path],
      ])}`;
}

export async function commandAuthLogout(ctx: CommandContext) {
  const settings = await loadSettings(ctx.args, ctx.deps);
  const shouldRevoke = hasFlag(ctx.args, "revoke");
  const env = ctx.deps.env ?? process.env;
  const externalCredential =
    getStringFlag(ctx.args, "api-key") ?? env.BISIBILITY_API_KEY ?? undefined;

  if (!shouldRevoke && externalCredential) {
    throw new CliError(
      "The active credential comes from --api-key or BISIBILITY_API_KEY. Remove it from the command or environment; the config was not changed.",
    );
  }
  if (!shouldRevoke && !settings.config.apiKey) {
    throw new CliError("No API credential is stored in the config.");
  }

  if (shouldRevoke) {
    if (!settings.apiKey) throw new CliError("No API credential is configured.");
    if (!settings.apiKey.startsWith("bsb_pat_live_")) {
      throw new CliError("--revoke requires a personal access token.");
    }
    const client = new BisibilityClient({
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      ...(ctx.deps.fetch ? { fetch: ctx.deps.fetch } : {}),
    });
    await client.account.tokens.revoke("current");
  }

  const { apiKey: storedCredential, ...configWithoutCredential } = settings.config;
  const removeStoredCredential = !externalCredential && Boolean(storedCredential);
  const path = removeStoredCredential
    ? await writeConfigFile(ctx.args, configWithoutCredential, ctx.deps)
    : settings.configPath;
  return renderKeyValues([
    ["revoked", shouldRevoke ? "yes" : "no"],
    [
      "local credential",
      removeStoredCredential ? "removed" : storedCredential ? "unchanged" : "not stored",
    ],
    ["config", path],
  ]);
}

export async function commandAuthStatus(ctx: CommandContext) {
  const { client: anonymousClient, settings } = await settingsAndClient(ctx, false);
  const client = settings.apiKey
    ? new BisibilityClient({ apiKey: settings.apiKey, baseUrl: settings.baseUrl })
    : anonymousClient;
  const base = {
    apiKey: redactSecret(settings.apiKey),
    baseUrl: settings.baseUrl,
    configPath: settings.configPath,
    projectConfigPath: settings.projectConfigPath ?? null,
    projectId: settings.projectId ?? null,
    projectSource: settings.projectSource ?? null,
  };
  if (hasFlag(ctx.args, "offline")) {
    return renderJson({ ...base, online: false });
  }
  if (settings.apiKey) {
    assertApiCredential(settings.apiKey, settings.apiKeySource ?? "config", settings.configPath);
  }

  const health = await client.system.getHealth();
  const personal = settings.apiKey?.startsWith("bsb_pat_live_") ?? false;
  const me = personal ? await client.account.get() : null;
  let projects: Array<{ domain: string; id: string; name: string }> = me?.projects ?? [];
  if (!me && settings.apiKey) {
    projects = (await client.projects.list()).data;
  }
  const activeProjectId =
    settings.projectId ?? (projects.length === 1 ? projects[0]?.id : undefined);
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  let tokenType: "personal" | "project" | null = null;
  if (personal) {
    tokenType = "personal";
  } else if (settings.apiKey) {
    tokenType = "project";
  }
  const result = {
    ...base,
    authenticated: Boolean(settings.apiKey),
    activeProject,
    health: health.status,
    projectSource: settings.projectSource ?? (activeProject ? "inferred" : null),
    tokenType,
    user: me ? { email: me.email, id: me.id, name: me.name } : null,
    projects: projects.map((project) => ({
      domain: project.domain,
      id: project.id,
      name: project.name,
    })),
  };
  if (hasFlag(ctx.args, "json")) {
    return renderJson(result);
  }
  return renderKeyValues([
    ["authenticated", result.authenticated ? "yes" : "no"],
    ["base URL", result.baseUrl],
    ["health", result.health],
    ["user", result.user?.email],
    ["token type", result.tokenType],
    ["projects", result.projects.length],
    ["current project", result.activeProject?.id],
    ["project source", result.projectSource],
  ]);
}

export async function commandAuth(ctx: CommandContext, rest: readonly string[]) {
  const action = rest[0] ?? "status";
  switch (action) {
    case "login":
      return commandAuthLogin(ctx);
    case "logout":
      return commandAuthLogout(ctx);
    case "status":
      return commandAuthStatus(ctx);
    default:
      throw new CliError("Auth command must be login, logout, or status.");
  }
}

export const handlers = { default: commandAuth };
