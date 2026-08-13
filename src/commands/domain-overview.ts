import type {
  DomainOverviewEstimate,
  DomainOverviewHistoricalRow,
  DomainOverviewRankedKeyword,
  DomainOverviewRelevantPage,
  DomainOverviewReport,
  DomainOverviewScope,
  EstimateDomainOverviewOptions,
  ProjectId,
} from "@bisibility/sdk";
import {
  CliError,
  type CommandContext,
  required,
  resolveProjectId,
  settingsAndClient,
} from "../context.js";
import { renderCsv, renderJson, renderKeyValues, renderTable } from "../format.js";
import { getStringFlag, hasFlag } from "../parser.js";

type Action = "analyze" | "history" | "keywords" | "pages";

const HISTORY_HEADERS = [
  "month",
  "year",
  "count",
  "estimated_traffic_cost_cents",
  "etv",
  "is_down",
  "is_lost",
  "is_new",
  "is_up",
  "pos1",
  "pos2_3",
  "pos4_10",
  "pos11_20",
  "pos21_30",
  "pos31_40",
  "pos41_50",
  "pos51_60",
  "pos61_70",
  "pos71_80",
  "pos81_90",
  "pos91_100",
] as const;

const KEYWORD_HEADERS = [
  "keyword",
  "position",
  "search_volume",
  "estimated_traffic",
  "cpc_cents",
  "difficulty",
  "intent",
  "ranking_url",
  "serp_features",
  "rank_absolute_delta",
  "rank_absolute",
] as const;

const PAGE_HEADERS = [
  "path",
  "keyword_count",
  "etv",
  "etv_delta_pct",
  "top_keyword",
  "top_keyword_position",
] as const;

function targetFromRest(rest: readonly string[]) {
  const target = required(rest[0], "Pass a Domain Overview target.").trim();
  if (!target) throw new CliError("Pass a Domain Overview target.");
  if (rest.length > 1) throw new CliError("Pass exactly one Domain Overview target.");
  return target;
}

function integerFlag(
  value: string | undefined,
  name: string,
  options: { fallback?: number; max?: number; min?: number } = {},
) {
  const { fallback, max, min = 0 } = options;
  if (value === undefined && fallback !== undefined) return fallback;
  if (value === undefined) throw new CliError(`${name} is required.`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || (max !== undefined && parsed > max)) {
    const range = max === undefined ? `${min} or greater` : `from ${min} through ${max}`;
    throw new CliError(`${name} must be an integer ${range}.`);
  }
  return parsed;
}

function scopeFlag(value: string | undefined): DomainOverviewScope | undefined {
  if (value === undefined) return undefined;
  if (value !== "root" && value !== "subdomain") {
    throw new CliError("--scope must be root or subdomain.");
  }
  return value;
}

function outputFlags(ctx: CommandContext, csvAllowed: boolean) {
  const csv = hasFlag(ctx.args, "csv");
  const json = hasFlag(ctx.args, "json");
  if (csv && json) throw new CliError("Pass only one of --csv or --json.");
  if (csv && !csvAllowed)
    throw new CliError("--csv is available for history, keywords, and pages.");
  return { csv, json };
}

function commonOptions(ctx: CommandContext, target: string) {
  const languageCode = required(
    getStringFlag(ctx.args, "language-code"),
    "--language-code is required.",
  ).trim();
  if (!languageCode) throw new CliError("--language-code is required.");
  const scopeOverride = scopeFlag(getStringFlag(ctx.args, "scope"));
  return {
    fresh: hasFlag(ctx.args, "fresh"),
    languageCode,
    locationCode: integerFlag(getStringFlag(ctx.args, "location-code"), "--location-code", {
      min: 1,
    }),
    ...(scopeOverride ? { scopeOverride } : {}),
    target,
  };
}

function maxCostFlag(ctx: CommandContext) {
  const raw = getStringFlag(ctx.args, "max-cost");
  return raw === undefined ? undefined : integerFlag(raw, "--max-cost");
}

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function authorizeCost(ctx: CommandContext, estimatedCostCents: number) {
  const maxCostCents = maxCostFlag(ctx);
  if (estimatedCostCents > 0 && maxCostCents === undefined) {
    throw new CliError(
      `Estimated provider cost: ${dollars(estimatedCostCents)}. Re-run with --max-cost ${Math.ceil(estimatedCostCents)} (or another explicit cap) to authorize the lookup.`,
    );
  }
  const cap = maxCostCents ?? 0;
  ctx.stderr.push(`Estimated provider cost: ${dollars(estimatedCostCents)} (cap: ${cap} cents).\n`);
  if (cap < estimatedCostCents) {
    ctx.stderr.push("The API will return cost_limit_exceeded on a cache miss above that cap.\n");
  }
  return cap;
}

function paidNotice(ctx: CommandContext, cached: boolean, costCents: number) {
  if (!cached && costCents > 0) {
    ctx.stderr.push(`Paid lookup: ${dollars(costCents)} charged to your DataForSEO account.\n`);
  }
}

function estimateSummary(estimate: DomainOverviewEstimate) {
  return renderKeyValues([
    ["target", estimate.target],
    ["scope", estimate.scope],
    ["market", `${estimate.location_code} / ${estimate.language_code}`],
    ["cached", estimate.cached ? "yes" : "no"],
    ["analysis estimate", dollars(estimate.estimated_cost_cents)],
    ["fresh analysis estimate", dollars(estimate.fresh_estimated_cost_cents)],
    ["history estimate", dollars(estimate.history_estimated_cost_cents)],
    ["keyword page estimate", dollars(estimate.keyword_page_estimated_cost_cents)],
    ["page page estimate", dollars(estimate.page_page_estimated_cost_cents)],
  ]);
}

function moduleSummary(module: DomainOverviewReport["keywords"] | DomainOverviewReport["pages"]) {
  if (!module.ok) return `${module.reason} (${module.cost_cents} cents)`;
  return `${module.data.rows.length} fetched / ${module.data.total_count ?? "unknown"} total`;
}

function reportSummary(report: DomainOverviewReport) {
  return renderKeyValues([
    ["target", report.target],
    ["scope", report.scope],
    ["market", `${report.location_code} / ${report.language_code}`],
    ["state", report.state],
    ["organic keywords", report.overview?.count ?? null],
    ["estimated traffic", report.overview?.etv ?? null],
    [
      "estimated traffic value",
      report.overview?.estimated_traffic_cost_cents == null
        ? null
        : dollars(report.overview.estimated_traffic_cost_cents),
    ],
    [
      "new / lost",
      report.overview ? `${report.overview.is_new} / ${report.overview.is_lost}` : null,
    ],
    [
      "improved / declined",
      report.overview ? `${report.overview.is_up} / ${report.overview.is_down}` : null,
    ],
    ["source snapshot", report.source_snapshot_at],
    ["previous source snapshot", report.previous_source_snapshot_at],
    ["keywords", moduleSummary(report.keywords)],
    ["pages", moduleSummary(report.pages)],
    ["status", report.cached ? "cached" : "fetched"],
    ["cost", report.cached ? null : dollars(report.cost_cents)],
  ]);
}

function historyRows(rows: readonly DomainOverviewHistoricalRow[]) {
  return rows.map((row) => ({ month: row.month, year: row.year, ...row.metrics }));
}

function historyTable(rows: readonly DomainOverviewHistoricalRow[]) {
  return renderTable(rows, [
    { header: "Period", value: (row) => `${row.year}-${String(row.month).padStart(2, "0")}` },
    { header: "Keywords", value: (row) => row.metrics.count },
    { header: "Est. traffic", value: (row) => row.metrics.etv },
    { header: "Traffic value cents", value: (row) => row.metrics.estimated_traffic_cost_cents },
    {
      header: "Top 10",
      value: (row) => row.metrics.pos1 + row.metrics.pos2_3 + row.metrics.pos4_10,
    },
  ]);
}

function keywordTable(rows: readonly DomainOverviewRankedKeyword[]) {
  return renderTable(rows, [
    { header: "Keyword", value: (row) => row.keyword },
    { header: "Position", value: (row) => row.position },
    { header: "SERP delta", value: (row) => row.rank_absolute_delta },
    { header: "Volume", value: (row) => row.search_volume },
    { header: "Est. traffic", value: (row) => row.estimated_traffic },
    { header: "CPC cents", value: (row) => row.cpc_cents },
    { header: "Intent", value: (row) => row.intent },
    { header: "Ranking URL", value: (row) => row.ranking_url },
  ]);
}

function pageTable(rows: readonly DomainOverviewRelevantPage[]) {
  return renderTable(rows, [
    { header: "Path", value: (row) => row.path },
    { header: "Keywords", value: (row) => row.keyword_count },
    { header: "Est. traffic", value: (row) => row.etv },
    { header: "Traffic delta", value: (row) => row.etv_delta_pct },
    { header: "Top keyword", value: (row) => row.top_keyword },
    { header: "Top position", value: (row) => row.top_keyword_position },
  ]);
}

async function contextFor(ctx: CommandContext, rest: readonly string[]) {
  const target = targetFromRest(rest);
  const common = commonOptions(ctx, target);
  const { client, settings } = await settingsAndClient(ctx);
  const projectId = await resolveProjectId(client, ctx, settings.projectId);
  return { client, common, projectId };
}

async function estimate(
  client: Awaited<ReturnType<typeof settingsAndClient>>["client"],
  projectId: ProjectId,
  options: Omit<EstimateDomainOverviewOptions, "estimateOnly">,
) {
  return client.domainOverview.analyze(projectId, { ...options, estimateOnly: true });
}

export async function commandDomainOverviewAnalyze(ctx: CommandContext, rest: readonly string[]) {
  const output = outputFlags(ctx, false);
  const { client, common, projectId } = await contextFor(ctx, rest);
  const keywordLimit = integerFlag(getStringFlag(ctx.args, "keyword-limit"), "--keyword-limit", {
    fallback: 100,
    max: 100,
    min: 1,
  });
  const pageLimit = integerFlag(getStringFlag(ctx.args, "page-limit"), "--page-limit", {
    fallback: 100,
    max: 1000,
    min: 1,
  });
  const estimateOptions = { ...common, keywordLimit, pageLimit };
  const estimated = await estimate(client, projectId, estimateOptions);
  if (hasFlag(ctx.args, "estimate")) {
    return output.json ? renderJson(estimated.data) : estimateSummary(estimated.data);
  }
  const estimatedCost = common.fresh
    ? estimated.data.fresh_estimated_cost_cents
    : estimated.data.estimated_cost_cents;
  const maxCostCents = authorizeCost(ctx, estimatedCost);
  const response = await client.domainOverview.analyze(projectId, {
    ...estimateOptions,
    estimateOnly: false,
    maxCostCents,
  });
  paidNotice(ctx, response.data.cached, response.data.cost_cents);
  return output.json ? renderJson(response.data) : reportSummary(response.data);
}

type PageAction = "keywords" | "pages";

async function commandPage(ctx: CommandContext, rest: readonly string[], action: PageAction) {
  const output = outputFlags(ctx, true);
  const { client, common, projectId } = await contextFor(ctx, rest);
  const max = action === "keywords" ? 100 : 1000;
  const limit = integerFlag(getStringFlag(ctx.args, "limit"), "--limit", {
    fallback: 100,
    max,
    min: 1,
  });
  const offset = integerFlag(getStringFlag(ctx.args, "offset"), "--offset", { fallback: 0 });
  const estimated = await estimate(client, projectId, {
    ...common,
    ...(action === "keywords" ? { keywordLimit: limit } : { pageLimit: limit }),
  });
  const estimatedCost =
    action === "keywords"
      ? estimated.data.keyword_page_estimated_cost_cents
      : estimated.data.page_page_estimated_cost_cents;
  const maxCostCents = authorizeCost(ctx, estimatedCost);
  const options = { ...common, limit, maxCostCents, offset };
  if (action === "keywords") {
    const response = await client.domainOverview.keywords(projectId, options);
    paidNotice(ctx, response.data.cached, response.data.cost_cents);
    if (output.json) return renderJson(response.data);
    const rows = response.data.data.rows;
    if (output.csv)
      return renderCsv(
        rows.map((row) => ({ ...row })),
        KEYWORD_HEADERS,
      );
    return `${renderKeyValues([
      ["target", common.target],
      ["rows", `${rows.length} fetched / ${response.data.data.total_count ?? "unknown"} total`],
      ["status", response.data.cached ? "cached" : "fetched"],
      ["cost", response.data.cached ? null : dollars(response.data.cost_cents)],
    ])}\n${keywordTable(rows)}`;
  }
  const response = await client.domainOverview.pages(projectId, options);
  paidNotice(ctx, response.data.cached, response.data.cost_cents);
  if (output.json) return renderJson(response.data);
  const rows = response.data.data.rows;
  if (output.csv)
    return renderCsv(
      rows.map((row) => ({ ...row })),
      PAGE_HEADERS,
    );
  return `${renderKeyValues([
    ["target", common.target],
    ["rows", `${rows.length} fetched / ${response.data.data.total_count} total`],
    ["status", response.data.cached ? "cached" : "fetched"],
    ["cost", response.data.cached ? null : dollars(response.data.cost_cents)],
  ])}\n${pageTable(rows)}`;
}

export async function commandDomainOverviewHistory(ctx: CommandContext, rest: readonly string[]) {
  const output = outputFlags(ctx, true);
  const { client, common, projectId } = await contextFor(ctx, rest);
  const estimated = await estimate(client, projectId, common);
  const maxCostCents = authorizeCost(ctx, estimated.data.history_estimated_cost_cents);
  const response = await client.domainOverview.history(projectId, { ...common, maxCostCents });
  paidNotice(ctx, response.data.cached, response.data.cost_cents);
  if (output.json) return renderJson(response.data);
  const rows = response.data.data;
  if (output.csv) return renderCsv(historyRows(rows), HISTORY_HEADERS);
  return `${renderKeyValues([
    ["target", common.target],
    ["periods", rows.length],
    ["status", response.data.cached ? "cached" : "fetched"],
    ["cost", response.data.cached ? null : dollars(response.data.cost_cents)],
  ])}\n${historyTable(rows)}`;
}

export const handlers = {
  analyze: commandDomainOverviewAnalyze,
  history: commandDomainOverviewHistory,
  keywords: (ctx: CommandContext, rest: readonly string[]) => commandPage(ctx, rest, "keywords"),
  pages: (ctx: CommandContext, rest: readonly string[]) => commandPage(ctx, rest, "pages"),
} satisfies Record<Action, (ctx: CommandContext, rest: readonly string[]) => Promise<string>>;

export async function dispatchDomainOverview(ctx: CommandContext, rest: readonly string[]) {
  const [action, ...actionRest] = rest;
  const handler =
    action && Object.hasOwn(handlers, action) ? handlers[action as Action] : undefined;
  if (!handler) {
    throw new CliError("Domain Overview command must be analyze, history, keywords, or pages.");
  }
  return handler(ctx, actionRest);
}
