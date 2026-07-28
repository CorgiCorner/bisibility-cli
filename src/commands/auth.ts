import { hostname } from "node:os";
import { BisibilityApiError, BisibilityClient } from "@bisibility/sdk";
import { loadSettings, readConfigFile, redactSecret, writeConfigFile } from "../config.js";
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

export async function commandAuthLogin(ctx: CommandContext) {
  const settings = await loadSettings(ctx.args, ctx.deps);
  const scope = authScope(ctx.args);
  const expiresInDays = authExpiry(ctx.args);
  const name = getStringFlag(ctx.args, "name") ?? `CLI on ${(ctx.deps.hostName ?? hostname)()}`;
  const oauth = await loginWithPkce(settings.cloudUrl, {
    ...(ctx.deps.fetch ? { fetch: ctx.deps.fetch } : {}),
    ...(ctx.deps.openBrowser ? { openBrowser: ctx.deps.openBrowser } : {}),
    ...(ctx.deps.oauthTimeoutMs ? { timeoutMs: ctx.deps.oauthTimeoutMs } : {}),
  });
  let issued: Awaited<ReturnType<Client["createMyToken"]>>;
  try {
    issued = await new BisibilityClient({
      apiKey: oauth.accessToken,
      baseUrl: settings.baseUrl,
      ...(ctx.deps.fetch ? { fetch: ctx.deps.fetch } : {}),
    }).createMyToken({ expires_in_days: expiresInDays, name, scope });
  } catch (error) {
    if (error instanceof BisibilityApiError) {
      throw new CliError(error.problem?.detail ?? error.message);
    }
    throw error;
  }
  const next = { ...(await readConfigFile(ctx.args, ctx.deps)), apiKey: issued.token };
  const path = await writeConfigFile(ctx.args, next, ctx.deps);
  return hasFlag(ctx.args, "json")
    ? renderJson({ configPath: path, expiresAt: issued.expires_at, id: issued.id, name, scope })
    : renderKeyValues([
        ["authenticated", "yes"],
        ["token", typeof issued.id === "string" ? issued.id : undefined],
        ["scope", scope],
        ["expires", typeof issued.expires_at === "string" ? issued.expires_at : undefined],
        ["config", path],
      ]);
}

export async function commandAuthLogout(ctx: CommandContext) {
  const { client, settings } = await settingsAndClient(ctx, false);
  if (!settings.apiKey) throw new CliError("No API credential is configured.");
  const personal = settings.apiKey.startsWith("bsp_");
  if (personal) {
    await client.revokeMyToken("current");
  }
  const { apiKey: _removed, ...next } = await readConfigFile(ctx.args, ctx.deps);
  const path = await writeConfigFile(ctx.args, next, ctx.deps);
  return renderKeyValues([
    ["revoked", personal ? "yes" : "not a personal token"],
    ["config", path],
  ]);
}

export async function commandAuthStatus(ctx: CommandContext) {
  const { client, settings } = await settingsAndClient(ctx, false);
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

  const health = await client.getHealth();
  const personal = settings.apiKey?.startsWith("bsp_") ?? false;
  const me = personal ? await client.getMe() : null;
  let projects: Array<{ domain: string; id: string; name: string }> = me?.projects ?? [];
  if (!me && settings.apiKey) {
    projects = (await client.listProjects()).data;
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
