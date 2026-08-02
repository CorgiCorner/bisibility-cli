import type {
  PageTrafficSnapshot,
  SearchPerformanceQueryStat,
  TrafficSyncRun,
} from "@bisibility/sdk";
import {
  CliError,
  type CommandContext,
  parsePositiveInt,
  required,
  resolveProjectId,
  settingsAndClient,
  stringListFromArgs,
} from "../context.js";
import { renderJson, renderKeyValues, renderTable } from "../format.js";
import { getStringFlag, hasFlag } from "../parser.js";
import { optionalPublicId } from "../public-id.js";

function parseOffset(value: string | undefined) {
  if (value === undefined) return 0;
  const offset = Number(value);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new CliError("--offset must be a non-negative integer.");
  }
  return offset;
}

function trafficColumns() {
  return [
    { header: "Path", value: (row: PageTrafficSnapshot) => row.path },
    { header: "Date", value: (row: PageTrafficSnapshot) => row.date },
    { header: "Sessions", value: (row: PageTrafficSnapshot) => row.sessions },
    { header: "Visitors", value: (row: PageTrafficSnapshot) => row.visitors },
    { header: "Provider", value: (row: PageTrafficSnapshot) => row.provider },
  ];
}

function queryColumns() {
  return [
    { header: "Query", value: (row: SearchPerformanceQueryStat) => row.query },
    { header: "Page", value: (row: SearchPerformanceQueryStat) => row.page },
    { header: "Clicks", value: (row: SearchPerformanceQueryStat) => row.clicks },
    { header: "Impressions", value: (row: SearchPerformanceQueryStat) => row.impressions },
    { header: "CTR", value: (row: SearchPerformanceQueryStat) => row.ctr },
    { header: "Position", value: (row: SearchPerformanceQueryStat) => row.position },
  ];
}

function syncColumns() {
  return [
    { header: "Provider", value: (row: TrafficSyncRun) => row.provider },
    { header: "Status", value: (row: TrafficSyncRun) => row.status },
    { header: "Fetched", value: (row: TrafficSyncRun) => row.rows_fetched },
    { header: "Matched", value: (row: TrafficSyncRun) => row.rows_matched },
    { header: "Upserted", value: (row: TrafficSyncRun) => row.rows_upserted },
  ];
}

export async function commandAnalytics(ctx: CommandContext, rest: readonly string[]) {
  const action = rest[0];
  const { client, settings } = await settingsAndClient(ctx);
  const projectId = await resolveProjectId(client, ctx, settings.projectId);

  if (action === "traffic-snapshots") {
    const limit = parsePositiveInt(getStringFlag(ctx.args, "limit"), "--limit", 50);
    if (limit > 200) throw new CliError("--limit must not exceed 200.");
    const paths = stringListFromArgs(ctx.args, "path", "paths");
    if (paths.length > 50) throw new CliError("Pass no more than 50 paths.");
    const result = await client.analytics.traffic.list(projectId, {
      endDate: required(getStringFlag(ctx.args, "end-date"), "Pass --end-date YYYY-MM-DD."),
      limit,
      offset: parseOffset(getStringFlag(ctx.args, "offset")),
      ...(paths.length ? { paths } : {}),
      startDate: required(getStringFlag(ctx.args, "start-date"), "Pass --start-date YYYY-MM-DD."),
    });
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : `${renderTable(result.rows, trafficColumns())}\n${renderKeyValues([
          ["total", result.total_count],
          ["offset", result.offset],
        ])}`;
  }

  if (action === "query-stats") {
    const limit = parsePositiveInt(getStringFlag(ctx.args, "limit"), "--limit", 100);
    if (limit > 1000) throw new CliError("--limit must not exceed 1000.");
    const connectionId = optionalPublicId(
      getStringFlag(ctx.args, "connection"),
      "conn",
      "Connection ID",
    );
    const query = getStringFlag(ctx.args, "query");
    const result = await client.analytics.searchPerformance.list(projectId, {
      ...(connectionId ? { connectionId } : {}),
      endDate: required(getStringFlag(ctx.args, "end-date"), "Pass --end-date YYYY-MM-DD."),
      limit,
      ...(query ? { query } : {}),
      startDate: required(getStringFlag(ctx.args, "start-date"), "Pass --start-date YYYY-MM-DD."),
    });
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : `${renderTable(result.rows, queryColumns())}\n${renderKeyValues([
          ["connection", result.connection.id],
          ["provider", result.connection.provider],
        ])}`;
  }

  if (action === "sync") {
    const idempotencyKey = getStringFlag(ctx.args, "idempotency-key");
    const result = await client.analytics.traffic.sync(
      projectId,
      idempotencyKey ? { idempotencyKey } : undefined,
    );
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : `${renderTable(result.runs, syncColumns())}\n${renderKeyValues([
          ["connections", result.connections],
          ["keyword snapshots", result.keyword_snapshots],
          ["page snapshots", result.page_snapshots],
          ["skipped", result.skipped.length],
        ])}`;
  }

  throw new CliError("Analytics command must be traffic-snapshots, query-stats, or sync.");
}

export const handlers = { default: commandAnalytics };
