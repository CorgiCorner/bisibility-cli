import type {
  ListRankChecksOptions,
  ProviderId,
  RankCheck,
  RunRankCheckInput,
  RunRankCheckResult,
} from "@bisibility/sdk";
import { renderJson, renderKeyValues, renderTable } from "../format.js";
import { type ParsedArgs, getStringFlag, hasFlag } from "../parser.js";
import { assertPublicId } from "../public-id.js";

import {
  CliError,
  type CommandContext,
  listOrAll,
  parseIsoDate,
  parsePositiveInt,
  parseRankCheckStatus,
  required,
  settingsAndClient,
} from "../context.js";

/**
 * The API answers rank check reads with an optional `observation_completeness` discriminator
 * (`"complete" | "truncated_by_stop_on_match" | "unknown"`) that distinguishes a confirmed
 * no-position result from one where the SERP sweep was incomplete. The published SDK's
 * `RankCheck` typing passes extra fields through without declaring them, so we widen the
 * local view at the single point of use rather than vendor the SDK's shape.
 */
type RankCheckWithCompleteness = RankCheck & {
  observation_completeness?: "complete" | "truncated_by_stop_on_match" | "unknown" | null;
};

function observationCompletenessLabel(check: RankCheckWithCompleteness) {
  const value = check.observation_completeness;
  return value === undefined ? null : value;
}

export function rankCheckSummary(result: RankCheck) {
  const widened = result as RankCheckWithCompleteness;
  return renderKeyValues([
    ["check", result.id],
    ["keyword", result.keyword_id],
    ["status", result.status],
    ["position", result.position],
    ["previous", result.previous_position],
    ["provider", result.provider],
    ["url", result.ranking_url],
    ["coverage", observationCompletenessLabel(widened)],
    ["error", result.error],
  ]);
}

/**
 * A deployment with a background worker answers `--async` with the queued run id instead of a
 * finished check, so the queued variant carries only an id and a status.
 */
export function rankCheckRunSummary(result: RunRankCheckResult) {
  if (result.status === "queued") {
    return renderKeyValues([
      ["run", result.id],
      ["status", result.status],
    ]);
  }
  return rankCheckSummary(result);
}

export function rankCheckColumns() {
  return [
    { header: "id", value: (check: RankCheck) => check.id },
    { header: "checked_at", value: (check: RankCheck) => check.checked_at },
    { header: "status", value: (check: RankCheck) => check.status },
    { header: "position", value: (check: RankCheck) => check.position },
    { header: "previous", value: (check: RankCheck) => check.previous_position },
    { header: "provider", value: (check: RankCheck) => check.provider },
    {
      header: "coverage",
      value: (check: RankCheck) => observationCompletenessLabel(check as RankCheckWithCompleteness),
    },
    { header: "error", value: (check: RankCheck) => check.error },
  ];
}

export function rankCheckListFilters(args: ParsedArgs): ListRankChecksOptions {
  const filters: ListRankChecksOptions = {
    limit: parsePositiveInt(getStringFlag(args, "limit"), "--limit", 50),
  };
  const cursor = getStringFlag(args, "cursor");
  const status = parseRankCheckStatus(getStringFlag(args, "status"));
  const since = parseIsoDate(getStringFlag(args, "since"), "--since");
  const until = parseIsoDate(getStringFlag(args, "until"), "--until");
  if (cursor) {
    filters.cursor = cursor;
  }
  if (status) {
    filters.status = status;
  }
  if (since) {
    filters.since = since;
  }
  if (until) {
    filters.until = until;
  }
  return filters;
}

export const PROVIDER_IDS = ["dataforseo", "ga4", "gsc", "plausible", "serpapi"] as const;

export function parseProviderId(value: string): ProviderId {
  if ((PROVIDER_IDS as readonly string[]).includes(value)) {
    return value as ProviderId;
  }
  throw new CliError(`--provider-id must be one of ${PROVIDER_IDS.join(", ")}.`);
}

export async function commandCheckRun(ctx: CommandContext, keywordId: string) {
  const { client } = await settingsAndClient(ctx);
  const resolvedKeywordId = assertPublicId(keywordId, "kw", "Keyword ID");
  const providerId = getStringFlag(ctx.args, "provider-id");
  const maxCost = getStringFlag(ctx.args, "max-cost");
  const input: RunRankCheckInput = {
    ...(providerId ? { provider_id: parseProviderId(providerId) } : {}),
    ...(maxCost ? { max_cost_cents: parsePositiveInt(maxCost, "--max-cost", 1) } : {}),
  };
  const hasInput = Object.keys(input).length > 0;
  const result = hasFlag(ctx.args, "async")
    ? await client.rankChecks.run(resolvedKeywordId, hasInput ? input : undefined, { async: true })
    : await client.rankChecks.run(resolvedKeywordId, hasInput ? input : undefined);
  return hasFlag(ctx.args, "json") ? renderJson(result) : rankCheckRunSummary(result);
}

export async function commandCheck(ctx: CommandContext, rest: readonly string[]) {
  const [action, ...tail] = rest;
  if (action === "get") {
    const checkId = assertPublicId(
      required(tail[0], "Pass a rank check ID."),
      "check",
      "Rank check ID",
    );
    const { client } = await settingsAndClient(ctx);
    const result = await client.rankChecks.getResult(checkId);
    return hasFlag(ctx.args, "json") ? renderJson(result) : rankCheckSummary(result);
  }
  if (action === "list") {
    const keywordId = assertPublicId(required(tail[0], "Pass a keyword ID."), "kw", "Keyword ID");
    const { client } = await settingsAndClient(ctx);
    const filters = rankCheckListFilters(ctx.args);
    const response = await listOrAll(
      () => client.rankChecks.list(keywordId, filters),
      (cursor) => client.rankChecks.iterate(keywordId, { ...filters, cursor }),
      hasFlag(ctx.args, "all"),
    );
    return hasFlag(ctx.args, "json")
      ? renderJson(response)
      : renderTable(response.data, rankCheckColumns());
  }
  if (action === "run") {
    return commandCheckRun(ctx, required(tail[0], "Pass a keyword ID."));
  }
  return commandCheckRun(ctx, required(action, "Pass a keyword ID."));
}

export const handlers = { default: commandCheck };
