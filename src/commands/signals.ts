import type {
  CreateSignalInput,
  CreateSignalSource,
  ListSignalsOptions,
  Signal,
  SignalSeverity,
  SignalSource,
} from "@bisibility/sdk";
import { renderJson, renderKeyValues, renderTable } from "../format.js";
import { type ParsedArgs, getStringFlag, hasFlag } from "../parser.js";
import { assertPublicId } from "../public-id.js";

import {
  CliError,
  type CommandContext,
  collectPaginated,
  parseIsoDate,
  parsePositiveInt,
  parseSignalPayload,
  required,
  resolveProjectId,
  settingsAndClient,
} from "../context.js";

export const CREATE_SIGNAL_SOURCES = ["api", "cms", "deploy"] as const;

export const SIGNAL_SOURCES = [
  "api",
  "cms",
  "deploy",
  "manual",
  "rank_tracker",
  "search_analytics",
  "search_engine_status",
  "sitemap",
  "url_inspection",
] as const;

export const SIGNAL_SEVERITIES = ["critical", "info", "warning"] as const;

export function parseCreateSignalSource(value: string): CreateSignalSource {
  if ((CREATE_SIGNAL_SOURCES as readonly string[]).includes(value)) {
    return value as CreateSignalSource;
  }
  throw new CliError(`--source must be one of ${CREATE_SIGNAL_SOURCES.join(", ")}.`);
}

export function parseSignalSource(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  if (!(SIGNAL_SOURCES as readonly string[]).includes(value)) {
    throw new CliError(`--source must be one of ${SIGNAL_SOURCES.join(", ")}.`);
  }
  return value as SignalSource;
}

export function parseSignalSeverity(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  if (!(SIGNAL_SEVERITIES as readonly string[]).includes(value)) {
    throw new CliError(`--severity must be one of ${SIGNAL_SEVERITIES.join(", ")}.`);
  }
  return value as SignalSeverity;
}

export function createSignalInput(args: ParsedArgs): CreateSignalInput {
  const source = parseCreateSignalSource(
    required(getStringFlag(args, "source"), "signals create requires --source."),
  );
  const type = required(getStringFlag(args, "type"), "signals create requires --type.");
  const input: CreateSignalInput = { source, type };
  const severity = parseSignalSeverity(getStringFlag(args, "severity"));
  const keywordId = getStringFlag(args, "keyword-id");
  const url = getStringFlag(args, "url");
  const payload = getStringFlag(args, "payload");
  const happenedAt = parseIsoDate(getStringFlag(args, "happened-at"), "--happened-at");
  if (severity) {
    input.severity = severity;
  }
  if (keywordId) {
    input.keyword_id = assertPublicId(keywordId, "kw", "Keyword ID");
  }
  if (url) {
    input.url = url;
  }
  if (payload) {
    input.payload = parseSignalPayload(payload);
  }
  if (happenedAt) {
    input.happened_at = happenedAt;
  }
  return input;
}

export function signalListFilters(args: ParsedArgs): ListSignalsOptions {
  const filters: ListSignalsOptions = {
    limit: parsePositiveInt(getStringFlag(args, "limit"), "--limit", 50),
  };
  const cursor = getStringFlag(args, "cursor");
  const source = parseSignalSource(getStringFlag(args, "source"));
  const type = getStringFlag(args, "type");
  const from = parseIsoDate(getStringFlag(args, "from"), "--from");
  const to = parseIsoDate(getStringFlag(args, "to"), "--to");
  if (cursor) {
    filters.cursor = cursor;
  }
  if (source) {
    filters.source = source;
  }
  if (type) {
    filters.type = type;
  }
  if (from) {
    filters.from = from;
  }
  if (to) {
    filters.to = to;
  }
  return filters;
}

export function signalSummary(signal: Signal) {
  return renderKeyValues([
    ["signal", signal.id],
    ["source", signal.source],
    ["type", signal.type],
    ["severity", signal.severity],
    ["happened", signal.happened_at],
    ["keyword", signal.keyword_id],
    ["url", signal.url],
  ]);
}

export function signalColumns() {
  return [
    { header: "id", value: (signal: Signal) => signal.id },
    { header: "source", value: (signal: Signal) => signal.source },
    { header: "type", value: (signal: Signal) => signal.type },
    { header: "severity", value: (signal: Signal) => signal.severity },
    { header: "happened_at", value: (signal: Signal) => signal.happened_at },
    { header: "keyword", value: (signal: Signal) => signal.keyword_id },
    { header: "url", value: (signal: Signal) => signal.url },
  ];
}

export async function commandSignals(ctx: CommandContext, rest: readonly string[]) {
  const action = rest[0] ?? "list";
  const { client, settings } = await settingsAndClient(ctx);

  if (action === "create") {
    const input = createSignalInput(ctx.args);
    const result = await client.createSignal(input);
    return hasFlag(ctx.args, "json") ? renderJson(result) : signalSummary(result);
  }

  if (action === "list") {
    const filters = signalListFilters(ctx.args);
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const response = await collectPaginated(
      (options) => client.listSignals(projectId, { ...filters, ...options }),
      filters,
      hasFlag(ctx.args, "all"),
    );
    return hasFlag(ctx.args, "json")
      ? renderJson(response)
      : renderTable(response.data, signalColumns());
  }

  throw new CliError("Signals command must be create or list.");
}

export const handlers = { default: commandSignals };
