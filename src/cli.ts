import { BisibilityApiError } from "@bisibility/sdk";
import { handlers as alertHandlers } from "./commands/alerts.js";
import { handlers as analyticsHandlers } from "./commands/analytics.js";
import { handlers as apiKeyHandlers } from "./commands/api-keys.js";
import { handlers as authHandlers } from "./commands/auth.js";
import { dispatchBacklinks } from "./commands/backlinks.js";
import { handlers as checkHandlers } from "./commands/checks.js";
import { handlers as cloudHandlers } from "./commands/cloud.js";
import { handlers as competitorHandlers } from "./commands/competitors.js";
import { handlers as configHandlers } from "./commands/config.js";
import { handlers as costHandlers } from "./commands/cost.js";
import { dispatchDomainOverview } from "./commands/domain-overview.js";
import { handlers as exportHandlers } from "./commands/export.js";
import { handlers as keywordHandlers } from "./commands/keywords.js";
import { handlers as linkHandlers } from "./commands/link.js";
import { handlers as locationHandlers } from "./commands/locations.js";
import { handlers as meHandlers } from "./commands/me.js";
import { handlers as metaHandlers } from "./commands/meta.js";
import { handlers as notificationHandlers } from "./commands/notifications.js";
import { handlers as projectHandlers } from "./commands/projects.js";
import { handlers as providerHandlers } from "./commands/providers.js";
import { handlers as savedHandlers } from "./commands/saved.js";
import { handlers as signalHandlers } from "./commands/signals.js";
import { handlers as sitemapHandlers } from "./commands/sitemaps.js";
import { handlers as teamHandlers } from "./commands/team.js";
import { handlers as tokenHandlers } from "./commands/tokens.js";
import { handlers as upgradeHandlers } from "./commands/upgrade.js";
import { handlers as viewHandlers } from "./commands/views.js";
import { type CliDeps, CliError, type CliResult, type CommandContext } from "./context.js";
import { VERSION, helpFor, mainHelp } from "./help.js";
import { ArgParseError, type ParsedArgs, hasFlag, parseArgv } from "./parser.js";
import { validatePublicIdArgs } from "./public-id.js";

type CommandHandler = (ctx: CommandContext, rest: readonly string[]) => Promise<string>;

async function dispatchKeywords(ctx: CommandContext, rest: readonly string[]) {
  const [action, ...actionRest] = rest;
  const handler = action ? keywordHandlers[action as keyof typeof keywordHandlers] : undefined;
  if (!handler)
    throw new CliError(
      "Keywords command must be add, list, get, update, delete, bulk, match, research, metrics, or suggest-ranked.",
    );
  return handler(ctx, actionRest);
}

async function dispatchCloud(ctx: CommandContext, rest: readonly string[]) {
  const [action, ...actionRest] = rest;
  if (action === "import") return cloudHandlers.import(ctx, actionRest);
  if (action === "compat") return cloudHandlers.compat(ctx, actionRest);
  throw new CliError("Cloud command must be import or compat.");
}

const commandHandlers: Readonly<Record<string, CommandHandler>> = {
  alerts: alertHandlers.default,
  analytics: analyticsHandlers.default,
  "api-keys": apiKeyHandlers.default,
  auth: authHandlers.default,
  backlinks: dispatchBacklinks,
  capabilities: metaHandlers.capabilities,
  check: checkHandlers.default,
  cloud: dispatchCloud,
  competitors: competitorHandlers.default,
  config: configHandlers.default,
  cost: costHandlers.default,
  "domain-overview": dispatchDomainOverview,
  export: exportHandlers.default,
  keywords: dispatchKeywords,
  link: linkHandlers.link,
  "llms-txt": metaHandlers.llmsText,
  locations: locationHandlers.default,
  me: meHandlers.default,
  notifications: notificationHandlers.default,
  openapi: metaHandlers.openapi,
  projects: projectHandlers.default,
  providers: providerHandlers.default,
  saved: savedHandlers.default,
  signals: signalHandlers.default,
  sitemaps: sitemapHandlers.default,
  team: teamHandlers.default,
  tokens: tokenHandlers.default,
  unlink: (ctx) => linkHandlers.unlink(ctx),
  upgrade: upgradeHandlers.upgrade,
  views: viewHandlers.default,
};

async function dispatch(ctx: CommandContext) {
  const [command, ...rest] = ctx.args.positionals;
  if (!command) return mainHelp();
  const handler = commandHandlers[command];
  if (!handler) throw new CliError(`Unknown command ${command}.`);
  return handler(ctx, rest);
}

function retryAfterSuffix(error: BisibilityApiError) {
  if (error.status !== 429) return "";
  const headers = error.headers as Headers | undefined;
  const retryAfter = typeof headers?.get === "function" ? headers.get("Retry-After") : null;
  if (!retryAfter) return "";
  return /^\d+$/.test(retryAfter) ? ` Retry after ${retryAfter}s.` : ` Retry after ${retryAfter}.`;
}

function problemExtensionSuffix(error: BisibilityApiError) {
  const extensions = error.problem?.errors;
  if (!extensions || typeof extensions !== "object" || Array.isArray(extensions)) return "";
  const values = extensions as Record<string, unknown>;
  const details: string[] = [];
  if (typeof values.reason === "string" && values.reason) {
    details.push(`reason=${values.reason}`);
  }
  if (typeof values.cost_cents === "number" && Number.isFinite(values.cost_cents)) {
    details.push(`cost_cents=${values.cost_cents}`);
  }
  if (
    (typeof values.reset_at === "number" && Number.isFinite(values.reset_at)) ||
    (typeof values.reset_at === "string" && values.reset_at)
  ) {
    details.push(`reset_at=${values.reset_at}`);
  }
  return details.length ? ` Details: ${details.join("; ")}.` : "";
}

function errorMessage(error: unknown) {
  if (error instanceof BisibilityApiError) {
    const detail = error.problem?.detail ?? error.message;
    return `API error ${error.status}: ${detail}${problemExtensionSuffix(error)}${retryAfterSuffix(error)}`;
  }
  if (error instanceof Error) return error.message;
  return "Unknown error.";
}

export async function runCli(argv: readonly string[], deps: CliDeps = {}): Promise<CliResult> {
  let args: ParsedArgs;
  try {
    args = parseArgv(argv);
  } catch (error) {
    const message = error instanceof ArgParseError ? error.message : errorMessage(error);
    return { exitCode: 2, stderr: `${message}\n`, stdout: "" };
  }
  if (hasFlag(args, "version")) return { exitCode: 0, stderr: "", stdout: `${VERSION}\n` };
  if (hasFlag(args, "help")) return { exitCode: 0, stderr: "", stdout: helpFor(args.positionals) };
  const stderr: string[] = [];
  const progress = deps.onProgress ?? ((message: string) => stderr.push(message));
  try {
    validatePublicIdArgs(args);
    const stdout = await dispatch({ args, deps, progress, stderr });
    return { exitCode: 0, stderr: stderr.join(""), stdout };
  } catch (error) {
    const exitCode = error instanceof CliError ? error.exitCode : 1;
    return { exitCode, stderr: `${stderr.join("")}${errorMessage(error)}\n`, stdout: "" };
  }
}

export { DEFAULT_BASE_URL } from "./config.js";
export type { CliDeps, CliResult } from "./context.js";
