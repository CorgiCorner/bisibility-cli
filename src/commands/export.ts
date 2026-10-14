import type {
  ExportRankHistoryCsvOptions,
  ExportRankHistoryJsonOptions,
  ExportRankHistoryReportJsonOptions,
  RankHistoryExportGranularity,
  RankHistoryExportRange,
} from "@bisibility/sdk";
import { renderCsv, renderJson } from "../format.js";
import { getStringFlag, getStringFlags, hasFlag } from "../parser.js";
import { publicIdList } from "../public-id.js";

import {
  CliError,
  type CommandContext,
  type ExportDocument,
  collectAsync,
  exportHeaders,
  mapWithConcurrency,
  parseFormat,
  parseIsoDate,
  parsePositiveInt,
  rankCheckRows,
  resolveProjectId,
  settingsAndClient,
  writeOrReturn,
} from "../context.js";

function rankHistoryRange(value: string | undefined): RankHistoryExportRange | undefined {
  if (value === undefined) return undefined;
  if (value !== "30" && value !== "90" && value !== "all") {
    throw new CliError("--range must be 30, 90, or all.");
  }
  return value;
}

function rankHistoryGranularity(
  value: string | undefined,
): RankHistoryExportGranularity | undefined {
  if (value === undefined) return undefined;
  if (value !== "daily" && value !== "weekly") {
    throw new CliError("--granularity must be daily or weekly.");
  }
  return value;
}

function keywordIds(ctx: CommandContext) {
  const ids = [
    ...getStringFlags(ctx.args, "keyword-id"),
    ...getStringFlags(ctx.args, "keyword-ids").flatMap((value) =>
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
  const unique = [...new Set(ids)];
  if (unique.length > 500) {
    throw new CliError("Pass no more than 500 keyword IDs.");
  }
  return publicIdList(unique, "kw", "Keyword ID");
}

export async function commandExportRankHistory(ctx: CommandContext) {
  const range = rankHistoryRange(getStringFlag(ctx.args, "range"));
  const granularity = rankHistoryGranularity(getStringFlag(ctx.args, "granularity"));
  const ids = keywordIds(ctx);
  const version = getStringFlag(ctx.args, "report-version") ?? "1";
  if (version !== "1" && version !== "2") throw new CliError("--report-version must be 1 or 2.");
  const stream = getStringFlag(ctx.args, "stream");
  const basis = getStringFlag(ctx.args, "basis");
  if (stream && stream !== "observations" && stream !== "attempts")
    throw new CliError("--stream must be observations or attempts.");
  if (basis && basis !== "observed_at" && basis !== "recorded_at")
    throw new CliError("--basis must be observed_at or recorded_at.");
  const from = parseIsoDate(getStringFlag(ctx.args, "from"), "--from");
  const to = parseIsoDate(getStringFlag(ctx.args, "to"), "--to");
  if (version === "1" && (stream || basis || from || to || hasFlag(ctx.args, "all")))
    throw new CliError("Report selection requires --report-version 2.");
  const filters: Omit<ExportRankHistoryJsonOptions, "format" | "version"> = {
    ...(range ? { range } : {}),
    ...(stream === "observations" || stream === "attempts" ? { stream } : {}),
    ...(basis === "observed_at" || basis === "recorded_at" ? { basis } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(granularity ? { granularity } : {}),
    ...(ids.length ? { keywordIds: ids } : {}),
  };
  const { client, settings } = await settingsAndClient(ctx);
  const projectId = await resolveProjectId(client, ctx, settings.projectId);

  if (hasFlag(ctx.args, "json")) {
    const limit = parsePositiveInt(getStringFlag(ctx.args, "limit"), "--limit", 50);
    if (limit > 200) {
      throw new CliError("--limit must be at most 200.");
    }
    const cursor = getStringFlag(ctx.args, "cursor");
    if (version === "2") {
      const options: ExportRankHistoryReportJsonOptions = {
        ...filters,
        version: "2",
        format: "json",
        limit,
        ...(cursor ? { cursor } : {}),
      };
      const result = hasFlag(ctx.args, "all")
        ? await client.rankChecks.history.exportAll(projectId, options)
        : await client.rankChecks.history.export(projectId, options);
      return writeOrReturn(ctx, renderJson(result));
    }
    const options: ExportRankHistoryJsonOptions = {
      ...filters,
      format: "json",
      limit,
      ...(cursor ? { cursor } : {}),
    };
    const result = await client.rankChecks.history.export(projectId, options);
    return writeOrReturn(ctx, renderJson(result));
  }

  if (hasFlag(ctx.args, "all")) throw new CliError("--all requires --json.");
  const options: ExportRankHistoryCsvOptions = {
    ...filters,
    ...(version === "2" ? { version } : {}),
    format: "csv",
  };
  const csv = await client.rankChecks.history.export(projectId, options);
  return writeOrReturn(ctx, csv);
}

export async function commandExport(ctx: CommandContext, rest: readonly string[] = []) {
  if (rest[0] === "rank-history") {
    return commandExportRankHistory(ctx);
  }
  if (rest.length > 0) {
    throw new CliError("Export command must be rank-history or no subcommand.");
  }
  const format = parseFormat(getStringFlag(ctx.args, "format"));
  const historyLimit = parsePositiveInt(
    getStringFlag(ctx.args, "history-limit"),
    "--history-limit",
    200,
  );
  const includeHistory = !hasFlag(ctx.args, "no-history");
  const { client, settings } = await settingsAndClient(ctx);
  const projectId = await resolveProjectId(client, ctx, settings.projectId);
  const keywords = await collectAsync(client.keywords.iterate(projectId, { limit: 200 }));
  const checks = includeHistory
    ? (
        await mapWithConcurrency(keywords, 5, (keyword) =>
          collectAsync(client.rankChecks.iterate(keyword.id, { limit: historyLimit })),
        )
      ).flat()
    : [];
  const document: ExportDocument = {
    exported_at: (ctx.deps.now ?? (() => new Date()))().toISOString(),
    keywords,
    project_id: projectId,
    rank_checks: checks,
    source: { base_url: settings.baseUrl },
    version: 1,
  };
  const output =
    format === "json"
      ? renderJson(document)
      : renderCsv(rankCheckRows(keywords, checks), exportHeaders());
  return writeOrReturn(ctx, output);
}

export const handlers = { default: commandExport };
