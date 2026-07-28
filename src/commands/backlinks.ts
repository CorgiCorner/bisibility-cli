import type {
  AnalyzeBacklinksOptions,
  BacklinkRow,
  BacklinksSnapshot,
  LoadMoreBacklinkRowsOptions,
} from "@bisibility/sdk";
import { renderCsv, renderJson, renderKeyValues, renderTable } from "../format.js";
import { getStringFlag, hasFlag } from "../parser.js";

import {
  CliError,
  type CommandContext,
  parsePositiveInt,
  required,
  resolveProjectId,
  settingsAndClient,
} from "../context.js";

const ANALYZE_LIMITS = [100, 300, 500, 1000] as const;
const ANALYZE_MODES = ["as-is", "one-per-domain"] as const;
const BACKLINK_VIEWS = ["links", "domains", "pages", "anchors"] as const;

type BacklinkView = (typeof BACKLINK_VIEWS)[number];
type ViewRow = Record<string, number | string | null | undefined>;

type ViewColumn = {
  header: string;
  key: string;
};

type ViewData = {
  columns: readonly ViewColumn[];
  label: string;
  rows: readonly ViewRow[];
};

function targetFromRest(rest: readonly string[]) {
  const target = required(rest[0], "Pass a backlinks target.").trim();
  if (target.length === 0) {
    throw new CliError("Pass a backlinks target.");
  }
  if (rest.length > 1) {
    throw new CliError("Pass exactly one backlinks target.");
  }
  return target;
}

function analyzeLimit(
  value: string | undefined,
): NonNullable<AnalyzeBacklinksOptions["resultLimit"]> {
  const limit = parsePositiveInt(value, "--limit", 100);
  if (!(ANALYZE_LIMITS as readonly number[]).includes(limit)) {
    throw new CliError(`--limit must be one of ${ANALYZE_LIMITS.join(", ")}.`);
  }
  return limit as NonNullable<AnalyzeBacklinksOptions["resultLimit"]>;
}

function analyzeMode(value: string | undefined): NonNullable<AnalyzeBacklinksOptions["mode"]> {
  const mode = value ?? "as-is";
  if (!(ANALYZE_MODES as readonly string[]).includes(mode)) {
    throw new CliError(`--mode must be one of ${ANALYZE_MODES.join(", ")}.`);
  }
  return mode === "as-is" ? "as_is" : "one_per_domain";
}

function backlinkView(value: string | undefined): BacklinkView {
  const view = value ?? "links";
  if (!(BACKLINK_VIEWS as readonly string[]).includes(view)) {
    throw new CliError(`--view must be one of ${BACKLINK_VIEWS.join(", ")}.`);
  }
  return view as BacklinkView;
}

function loadMoreLimit(value: string | undefined): LoadMoreBacklinkRowsOptions["limit"] {
  const limit = value === undefined ? 100 : Number(value);
  if (!Number.isInteger(limit) || limit < 100 || limit > 1000 || limit % 100 !== 0) {
    throw new CliError("--limit must be a multiple of 100 from 100 through 1000.");
  }
  return limit as LoadMoreBacklinkRowsOptions["limit"];
}

function scopeOptions(ctx: CommandContext) {
  return {
    includeSubdomains: !hasFlag(ctx.args, "no-subdomains"),
    targetScope: hasFlag(ctx.args, "page") ? ("page" as const) : ("site" as const),
  };
}

function paidLookupNotice(ctx: CommandContext, costCents: number) {
  ctx.stderr.push(
    `Paid lookup: $${(costCents / 100).toFixed(2)} charged to your DataForSEO account (snapshot cached for 24h).\n`,
  );
}

function snapshotSummary(snapshot: BacklinksSnapshot) {
  return renderKeyValues([
    ["target", snapshot.target],
    ["scope", snapshot.target_scope],
    ["include subdomains", snapshot.include_subdomains ? "yes" : "no"],
    ["backlinks total", snapshot.summary.backlinks_total],
    ["referring domains", snapshot.summary.referring_domains_total],
    ["referring pages", snapshot.summary.referring_pages],
    ["domain rank", snapshot.summary.domain_rank],
    ["spam score", snapshot.summary.spam_score],
    ["dofollow pct", snapshot.summary.dofollow_pct],
    ["new backlinks", snapshot.summary.new_backlinks],
    ["lost backlinks", snapshot.summary.lost_backlinks],
    ["new referring domains", snapshot.summary.new_referring_domains],
    ["lost referring domains", snapshot.summary.lost_referring_domains],
    ["broken backlinks", snapshot.summary.broken_backlinks],
    ["broken pages", snapshot.summary.broken_pages],
    ["fetched rows", `${snapshot.fetched_row_count} / ${snapshot.total_rows_available}`],
    ["provider", snapshot.provider],
    ["status", snapshot.cached ? "cached" : "paid"],
    ["cost cents", snapshot.cached ? null : snapshot.cost_cents],
  ]);
}

function linkView(rows: readonly BacklinkRow[]): ViewData {
  return {
    columns: [
      { header: "Source domain", key: "source_domain" },
      { header: "Source URL", key: "source_url" },
      { header: "Anchor", key: "anchor" },
      { header: "Target URL", key: "target_url" },
      { header: "Flags", key: "flags" },
      { header: "DA", key: "domain_authority" },
      { header: "Spam", key: "spam_score" },
      { header: "Links", key: "links_count" },
      { header: "First seen", key: "first_seen" },
      { header: "Lost at", key: "lost_at" },
      { header: "Status", key: "status" },
    ],
    label: "Links",
    rows: rows.map((row) => ({
      anchor: row.anchor,
      domain_authority: row.domain_authority,
      first_seen: row.first_seen,
      flags: row.flags.join(","),
      links_count: row.links_count,
      lost_at: row.lost_at,
      source_domain: row.source_domain,
      source_url: row.source_url,
      spam_score: row.spam_score,
      status: row.status,
      target_url: row.target_url,
    })),
  };
}

function domainView(rows: readonly BacklinkRow[]): ViewData {
  const grouped = new Map<string, { max_domain_authority: number; row_count: number }>();
  for (const row of rows) {
    const current = grouped.get(row.source_domain);
    grouped.set(row.source_domain, {
      max_domain_authority: Math.max(current?.max_domain_authority ?? 0, row.domain_authority),
      row_count: (current?.row_count ?? 0) + 1,
    });
  }
  return {
    columns: [
      { header: "Source domain", key: "source_domain" },
      { header: "Rows", key: "row_count" },
      { header: "Max DA", key: "max_domain_authority" },
    ],
    label: "Domains",
    rows: [...grouped].map(([sourceDomain, values]) => ({
      max_domain_authority: values.max_domain_authority,
      row_count: values.row_count,
      source_domain: sourceDomain,
    })),
  };
}

function countedView(
  rows: readonly BacklinkRow[],
  key: "anchor" | "target_url",
  label: string,
  header: string,
): ViewData {
  const grouped = new Map<string, number>();
  for (const row of rows) {
    grouped.set(row[key], (grouped.get(row[key]) ?? 0) + 1);
  }
  return {
    columns: [
      { header, key },
      { header: "Rows", key: "row_count" },
    ],
    label,
    rows: [...grouped].map(([value, rowCount]) => ({
      [key]: value,
      row_count: rowCount,
    })),
  };
}

function dataForView(rows: readonly BacklinkRow[], view: BacklinkView): ViewData {
  if (view === "domains") return domainView(rows);
  if (view === "pages") return countedView(rows, "target_url", "Pages", "Target URL");
  if (view === "anchors") return countedView(rows, "anchor", "Anchors", "Anchor");
  return linkView(rows);
}

function tableCell(value: ViewRow[string]) {
  return value;
}

function renderView(snapshot: BacklinksSnapshot, view: BacklinkView, csv: boolean) {
  const data = dataForView(snapshot.rows, view);
  if (csv) {
    const rows = data.rows.map((row) =>
      Object.fromEntries(
        data.columns.map(({ key }) => {
          const value = row[key];
          return [key, value === null || value === undefined || value === "" ? "-" : value];
        }),
      ),
    );
    return renderCsv(
      rows,
      data.columns.map(({ key }) => key),
    );
  }
  const heading =
    view === "links"
      ? ""
      : `${data.label} within fetched rows (${snapshot.fetched_row_count} of ${snapshot.total_rows_available})\n`;
  return `${heading}${renderTable(
    data.rows,
    data.columns.map(({ header, key }) => ({
      header,
      value: (row) => tableCell(row[key]),
    })),
  )}`;
}

export async function commandBacklinksAnalyze(ctx: CommandContext, rest: readonly string[]) {
  const target = targetFromRest(rest);
  const resultLimit = analyzeLimit(getStringFlag(ctx.args, "limit"));
  const mode = analyzeMode(getStringFlag(ctx.args, "mode"));
  const view = backlinkView(getStringFlag(ctx.args, "view"));
  const maxCost = getStringFlag(ctx.args, "max-cost");
  const { client, settings } = await settingsAndClient(ctx);
  const projectId = await resolveProjectId(client, ctx, settings.projectId);
  const options: AnalyzeBacklinksOptions = {
    estimateOnly: hasFlag(ctx.args, "estimate"),
    fresh: hasFlag(ctx.args, "fresh"),
    ...scopeOptions(ctx),
    ...(maxCost ? { maxCostCents: parsePositiveInt(maxCost, "--max-cost", 1) } : {}),
    mode,
    resultLimit,
    target,
  };
  const response = await client.analyzeBacklinks(projectId, options);
  if (!options.estimateOnly && !response.data.cached) {
    paidLookupNotice(ctx, response.data.cost_cents);
  }
  if (options.estimateOnly || hasFlag(ctx.args, "json")) {
    return renderJson(response);
  }
  if (hasFlag(ctx.args, "csv")) {
    return renderView(response.data, view, true);
  }
  return `${snapshotSummary(response.data)}\n${renderView(response.data, view, false)}`;
}

export async function commandBacklinksMore(ctx: CommandContext, rest: readonly string[]) {
  const target = targetFromRest(rest);
  const options: LoadMoreBacklinkRowsOptions = {
    ...scopeOptions(ctx),
    limit: loadMoreLimit(getStringFlag(ctx.args, "limit")),
    target,
  };
  const { client, settings } = await settingsAndClient(ctx);
  const projectId = await resolveProjectId(client, ctx, settings.projectId);
  const response = await client.loadMoreBacklinkRows(projectId, options);
  if (!response.data.cached) {
    paidLookupNotice(ctx, response.data.cost_cents);
  }
  if (hasFlag(ctx.args, "json")) {
    return renderJson(response);
  }
  return `Fetched ${response.data.rows.length} more rows.\n${renderKeyValues([
    ["fetched rows", `${response.data.fetched_row_count} / ${response.data.total_rows_available}`],
  ])}`;
}

export const handlers = {
  analyze: commandBacklinksAnalyze,
  more: commandBacklinksMore,
};

export async function dispatchBacklinks(ctx: CommandContext, rest: readonly string[]) {
  const [action, ...actionRest] = rest;
  const handler = action ? handlers[action as keyof typeof handlers] : undefined;
  if (!handler) {
    throw new CliError("Backlinks command must be analyze or more.");
  }
  return handler(ctx, actionRest);
}
