import { basename } from "node:path";
import { BisibilityApiError, BisibilityClient, type CloudImportPackage } from "@bisibility/sdk";
import { loadSettings } from "../config.js";
import { renderJson, renderKeyValues } from "../format.js";
import { getStringFlag, hasFlag } from "../parser.js";

import { CliError, type CommandContext, required } from "../context.js";

// The public API is served under `/api/v1`, but the migration workflow targets a
// separate cloud host (`cloudUrl`) that may differ from the API base URL. Cross-
// instance migration is intentional, so we build the cloud API base by joining the
// cloud host with the documented `/api/v1` server prefix rather than reusing baseUrl.
export function cloudApiBaseUrl(cloudUrl: string) {
  const trimmed = cloudUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;
}

export function parseImportPackage(raw: string, fileName: string): CloudImportPackage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON";
    throw new CliError(`Could not parse JSON from ${fileName}: ${detail}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliError(
      `Cloud import expects a JSON export package object in ${fileName}; got ${
        Array.isArray(parsed) ? "an array" : typeof parsed
      }.`,
    );
  }
  return parsed as CloudImportPackage;
}

export function arrayLength(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = (value as Record<string, unknown>)[key];
  return Array.isArray(candidate) ? candidate.length : null;
}

function cloudClient(ctx: CommandContext, cloudUrl: string, migrationToken?: string) {
  return new BisibilityClient({
    baseUrl: cloudApiBaseUrl(cloudUrl),
    ...(migrationToken ? { apiKey: migrationToken } : {}),
    ...(ctx.deps.fetch ? { fetch: ctx.deps.fetch } : {}),
  });
}

export async function commandCloudImport(ctx: CommandContext, rest: readonly string[]) {
  const file = required(rest[0], "Pass an export file.");
  const settings = await loadSettings(ctx.args, ctx.deps);
  const token =
    getStringFlag(ctx.args, "token") ??
    ctx.deps.env?.BISIBILITY_MIGRATION_TOKEN ??
    process.env.BISIBILITY_MIGRATION_TOKEN;
  if (!token) {
    throw new CliError(
      "Migration token is required. Pass --token or set BISIBILITY_MIGRATION_TOKEN.",
    );
  }

  const read = ctx.deps.readFile ?? (await import("node:fs/promises")).readFile;
  const raw = await read(file, "utf8");
  const pkg = parseImportPackage(raw, file);
  const summary = {
    cloud_url: cloudApiBaseUrl(settings.cloudUrl),
    file: basename(file),
    keyword_count: arrayLength(pkg, "keywords"),
    rank_check_count: arrayLength(pkg, "rank_checks"),
  };

  if (hasFlag(ctx.args, "dry-run")) {
    return renderJson({ dry_run: true, ...summary });
  }

  let result: Awaited<ReturnType<BisibilityClient["importCloudExport"]>>;
  try {
    // Migration tokens authenticate as `Authorization: Bearer mig_...`, so the token
    // is supplied as the client credential and the SDK targets the spec-correct
    // `/cloud/import` route on the cross-instance cloud host.
    result = await cloudClient(ctx, settings.cloudUrl, token).importCloudExport(pkg);
  } catch (error) {
    if (error instanceof BisibilityApiError) {
      throw new CliError(error.problem?.detail ?? error.message);
    }
    throw error;
  }

  if (hasFlag(ctx.args, "json")) {
    return renderJson(result);
  }
  return renderKeyValues([
    ["cloud", summary.cloud_url],
    ["file", summary.file],
    ["job", result.job_id],
    ["state", result.state],
  ]);
}

export async function commandCloudCompat(ctx: CommandContext, _rest: readonly string[] = []) {
  const settings = await loadSettings(ctx.args, ctx.deps);
  let result: Awaited<ReturnType<BisibilityClient["getCloudImportCompatibility"]>>;
  try {
    result = await cloudClient(ctx, settings.cloudUrl).getCloudImportCompatibility();
  } catch (error) {
    if (error instanceof BisibilityApiError) {
      throw new CliError(error.problem?.detail ?? error.message);
    }
    throw error;
  }
  if (hasFlag(ctx.args, "json")) {
    return renderJson(result);
  }
  return renderKeyValues([
    ["cloud", cloudApiBaseUrl(settings.cloudUrl)],
    ["app version", result.app_version],
    ["latest migration", result.latest_migration],
    ["schema versions", result.schema_versions_supported.join(", ")],
  ]);
}

export const handlers = { compat: commandCloudCompat, import: commandCloudImport };
