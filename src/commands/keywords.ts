import type {
  CreateKeywordInput,
  GetKeywordMetricsInput,
  Keyword,
  KeywordBulkInput,
  KeywordMatch,
  KeywordMatchResponse,
  KeywordMetricsResponse,
  KeywordMetricsRow,
  KeywordResearchMode,
  KeywordResearchResponse,
  KeywordResearchResultLimit,
  KeywordResearchRow,
  KeywordResearchSourceDiagnostic,
  ListRankedKeywordSuggestionsOptions,
  RankedKeywordSuggestion,
  RankedKeywordSuggestionsResponse,
  UpdateKeywordInput,
} from "@bisibility/sdk";
import { renderJson, renderKeyValues, renderTable } from "../format.js";
import { type ParsedArgs, getStringFlag, hasFlag } from "../parser.js";

import {
  CliError,
  type CommandContext,
  collectKeywords,
  hasOwnProperties,
  keywordColumns,
  keywordFilters,
  parseDevice,
  parseFrequency,
  parseJsonObject,
  parsePositiveInt,
  readTextFile,
  required,
  resolveProjectId,
  settingsAndClient,
  stringListFromArgs,
  tagsFromArgs,
} from "../context.js";
import {
  assertPublicId,
  optionalPublicId,
  publicIdList,
  validateKeywordBulkInput,
} from "../public-id.js";

const RESEARCH_MODES = ["auto", "related", "suggestions", "ideas"] as const;
const RESEARCH_LIMITS = [100, 300, 500] as const;

function researchMode(value: string | undefined): KeywordResearchMode {
  const mode = value ?? "auto";
  if (!(RESEARCH_MODES as readonly string[]).includes(mode)) {
    throw new CliError(`--mode must be one of ${RESEARCH_MODES.join(", ")}.`);
  }
  return mode as KeywordResearchMode;
}

function researchLimit(value: string | undefined): KeywordResearchResultLimit {
  const limit = parsePositiveInt(value, "--limit", 100);
  if (!(RESEARCH_LIMITS as readonly number[]).includes(limit)) {
    throw new CliError(`--limit must be one of ${RESEARCH_LIMITS.join(", ")}.`);
  }
  return limit as KeywordResearchResultLimit;
}

function connectionOptions(ctx: CommandContext) {
  const connectionId = optionalPublicId(
    getStringFlag(ctx.args, "connection"),
    "conn",
    "Connection ID",
  );
  const maxCost = getStringFlag(ctx.args, "max-cost");
  return {
    ...(connectionId ? { connectionId } : {}),
    estimateOnly: hasFlag(ctx.args, "estimate"),
    fresh: hasFlag(ctx.args, "fresh"),
    includeClickstream: hasFlag(ctx.args, "clickstream"),
    ...(maxCost ? { maxCostCents: parsePositiveInt(maxCost, "--max-cost", 1) } : {}),
  };
}

function formatCpc(cents: number | null) {
  return cents === null ? null : `$${(cents / 100).toFixed(2)}`;
}

function researchColumns() {
  return [
    { header: "Keyword", value: (row: KeywordResearchRow) => row.keyword },
    { header: "Volume", value: (row: KeywordResearchRow) => row.search_volume },
    { header: "KD", value: (row: KeywordResearchRow) => row.difficulty },
    { header: "CPC", value: (row: KeywordResearchRow) => formatCpc(row.cpc_cents) },
    { header: "Intent", value: (row: KeywordResearchRow) => row.intent },
    { header: "Source", value: (row: KeywordResearchRow) => row.source },
    { header: "Tracked", value: (row: KeywordResearchRow) => (row.already_tracked ? "yes" : "") },
  ];
}

function researchSourceColumns() {
  return [
    { header: "Source", value: (source: KeywordResearchSourceDiagnostic) => source.source },
    { header: "Status", value: (source: KeywordResearchSourceDiagnostic) => source.status },
    { header: "Returned", value: (source: KeywordResearchSourceDiagnostic) => source.returned },
    {
      header: "Cache",
      value: (source: KeywordResearchSourceDiagnostic) => (source.cached ? "hit" : "miss"),
    },
    { header: "Cost", value: (source: KeywordResearchSourceDiagnostic) => source.cost_cents },
    { header: "Reason", value: (source: KeywordResearchSourceDiagnostic) => source.reason },
  ];
}

function metricsColumns() {
  return [
    { header: "Keyword", value: (row: KeywordMetricsRow) => row.keyword },
    { header: "Volume", value: (row: KeywordMetricsRow) => row.search_volume },
    { header: "KD", value: (row: KeywordMetricsRow) => row.difficulty },
    { header: "CPC", value: (row: KeywordMetricsRow) => formatCpc(row.cpc_cents) },
    { header: "Intent", value: (row: KeywordMetricsRow) => row.intent },
  ];
}

function paidLookupNotice(ctx: CommandContext, costCents: number) {
  ctx.stderr.push(
    `Paid lookup: $${(costCents / 100).toFixed(2)} charged to your DataForSEO account (cached for 12h).\n`,
  );
}

function researchHumanOutput(response: KeywordResearchResponse) {
  return `${renderTable(response.rows, researchColumns())}\nSources\n${renderTable(
    response.sources,
    researchSourceColumns(),
  )}\n${renderKeyValues([
    ["total", response.total_count],
    ["provider", response.provider],
    ["status", response.cached ? "cached" : "paid"],
    ["cost cents", response.cached ? null : response.cost_cents],
  ])}`;
}

export async function commandKeywordsResearch(ctx: CommandContext, rest: readonly string[]) {
  const seed = required(rest[0], "Pass one seed keyword.").trim();
  if (seed.length < 1 || seed.length > 80) {
    throw new CliError("The seed must contain 1 to 80 characters.");
  }
  if (rest.length > 1) {
    throw new CliError("Pass exactly one seed keyword.");
  }
  const mode = researchMode(getStringFlag(ctx.args, "mode"));
  const resultLimit = researchLimit(getStringFlag(ctx.args, "limit"));
  const { client, settings } = await settingsAndClient(ctx);
  const projectId = await resolveProjectId(client, ctx, settings.projectId);
  const options = connectionOptions(ctx);
  const response = await client.researchKeywords(projectId, {
    ...options,
    mode,
    resultLimit,
    seed,
  });
  if (!options.estimateOnly && !response.cached) paidLookupNotice(ctx, response.cost_cents);
  return options.estimateOnly || hasFlag(ctx.args, "json")
    ? renderJson(response)
    : researchHumanOutput(response);
}

function keywordMetricInput(
  keywords: readonly string[],
  ctx: CommandContext,
): GetKeywordMetricsInput {
  const connectionId = optionalPublicId(
    getStringFlag(ctx.args, "connection"),
    "conn",
    "Connection ID",
  );
  const maxCost = getStringFlag(ctx.args, "max-cost");
  return {
    ...(connectionId ? { connection_id: connectionId } : {}),
    estimate_only: hasFlag(ctx.args, "estimate"),
    fresh: hasFlag(ctx.args, "fresh"),
    include_clickstream: hasFlag(ctx.args, "clickstream"),
    keywords,
    ...(maxCost ? { max_cost_cents: parsePositiveInt(maxCost, "--max-cost", 1) } : {}),
  };
}

async function metricKeywords(ctx: CommandContext) {
  const inline = getStringFlag(ctx.args, "keywords");
  const file = getStringFlag(ctx.args, "file");
  if (inline && file) {
    throw new CliError("Pass either --keywords or --file, not both.");
  }
  if (!inline && !file) {
    throw new CliError("Pass keywords with --keywords or --file.");
  }
  const raw = inline ?? (await readTextFile(ctx, file as string));
  const keywords: string[] = [];
  const seen = new Set<string>();
  for (const keyword of raw.split(file ? /\r?\n/ : ",").map((value) => value.trim())) {
    const normalized = keyword.toLocaleLowerCase("en-US");
    if (keyword.length === 0 || (Boolean(file) && keyword.startsWith("#")) || seen.has(normalized))
      continue;
    seen.add(normalized);
    keywords.push(keyword);
  }
  if (keywords.length === 0) {
    throw new CliError("Pass at least one non-empty keyword.");
  }
  if (keywords.length > 700) {
    throw new CliError("Keyword metrics accepts at most 700 keywords per request.");
  }
  return keywords;
}

function metricsHumanOutput(response: KeywordMetricsResponse) {
  const status = response.fetched_count === 0 ? "cached" : "paid";
  return `${renderTable(response.rows, metricsColumns())}\n${renderKeyValues([
    ["total", response.total_count],
    ["cached", response.cached_count],
    ["fetched", response.fetched_count],
    ["provider", response.provider],
    ["status", status],
    ["cost cents", response.fetched_count === 0 ? null : response.cost_cents],
  ])}`;
}

type KeywordMatchResult = {
  matched_text: string;
  matches: KeywordMatch[];
  tracked: boolean;
  truncated: boolean;
};

type KeywordMatchTableRow = KeywordMatchResult & { match: KeywordMatch | undefined };

function normalizeMatchText(text: string) {
  return text.trim().toLocaleLowerCase("en-US");
}

function matchTexts(rest: readonly string[]) {
  if (rest.length === 0) {
    throw new CliError("Pass at least one text to match.");
  }
  if (rest.length > 50) {
    throw new CliError("Keyword matching accepts at most 50 texts per request.");
  }
  return rest.map((text) => {
    const trimmed = text.trim();
    if (trimmed.length < 1 || trimmed.length > 180) {
      throw new CliError("Each text must contain 1 to 180 characters after trimming.");
    }
    return trimmed;
  });
}

function matchResults(
  texts: readonly string[],
  response: KeywordMatchResponse,
): KeywordMatchResult[] {
  const truncated = new Set(response.meta.truncated_texts);
  return texts.map((text) => {
    const matchedText = normalizeMatchText(text);
    const matches = response.data.filter((match) => match.matched_text === matchedText);
    return {
      matched_text: matchedText,
      matches,
      tracked: matches.length > 0,
      truncated: truncated.has(matchedText),
    };
  });
}

function matchColumns() {
  return [
    {
      header: "Requested",
      value: (row: KeywordMatchTableRow) => row.matched_text,
    },
    {
      header: "Stored text",
      value: (row: KeywordMatchTableRow) => row.match?.text,
    },
    {
      header: "Status",
      value: (row: KeywordMatchTableRow) => (row.match ? "tracked" : "not tracked"),
    },
    {
      header: "Location",
      value: (row: KeywordMatchTableRow) => row.match?.market.location,
    },
    {
      header: "Location key",
      value: (row: KeywordMatchTableRow) => row.match?.market.location_key,
    },
    {
      header: "Country",
      value: (row: KeywordMatchTableRow) => row.match?.market.country_code,
    },
    {
      header: "Device",
      value: (row: KeywordMatchTableRow) => row.match?.market.device,
    },
    {
      header: "Position",
      value: (row: KeywordMatchTableRow) => row.match?.latest_position,
    },
  ];
}

function matchHumanOutput(results: readonly KeywordMatchResult[]) {
  const rows = results.flatMap<KeywordMatchTableRow>((result) =>
    result.matches.length
      ? result.matches.map((match) => ({ ...result, match }))
      : [{ ...result, match: undefined }],
  );
  const partial = results.filter((result) => result.truncated).map((result) => result.matched_text);
  const notice = partial.length
    ? `Warning: partial market results for ${partial.join(", ")}; each has more than 100 matches.\n`
    : "";
  return `${renderTable(rows, matchColumns())}${notice}`;
}

export async function commandKeywordsMatch(ctx: CommandContext, rest: readonly string[]) {
  const texts = matchTexts(rest);
  const { client, settings } = await settingsAndClient(ctx);
  const projectId = await resolveProjectId(client, ctx, settings.projectId);
  const response = await client.matchProjectKeywords(projectId, { texts });
  const results = matchResults(texts, response);
  return hasFlag(ctx.args, "json")
    ? renderJson({ ...response, results })
    : matchHumanOutput(results);
}

export async function commandKeywordsMetrics(ctx: CommandContext) {
  const keywords = await metricKeywords(ctx);
  const { client, settings } = await settingsAndClient(ctx);
  const projectId = await resolveProjectId(client, ctx, settings.projectId);
  const response = await client.getKeywordMetrics(projectId, keywordMetricInput(keywords, ctx));
  const estimateOnly = hasFlag(ctx.args, "estimate");
  if (!estimateOnly && response.fetched_count > 0) paidLookupNotice(ctx, response.cost_cents);
  return estimateOnly || hasFlag(ctx.args, "json")
    ? renderJson(response)
    : metricsHumanOutput(response);
}

function parseRankedOffset(value: string | undefined) {
  if (value === undefined) return 0;
  const offset = Number(value);
  if (!Number.isInteger(offset) || offset < 0 || offset > 900 || offset % 100 !== 0) {
    throw new CliError("--offset must be a multiple of 100 from 0 through 900.");
  }
  return offset;
}

function rankedSuggestionOptions(ctx: CommandContext): ListRankedKeywordSuggestionsOptions {
  const limit = parsePositiveInt(getStringFlag(ctx.args, "limit"), "--limit", 100);
  if (limit > 100) throw new CliError("--limit must not exceed 100.");
  const connectionId = optionalPublicId(
    getStringFlag(ctx.args, "connection"),
    "conn",
    "Connection ID",
  );
  return {
    ...(connectionId ? { connectionId } : {}),
    fresh: hasFlag(ctx.args, "fresh"),
    limit,
    offset: parseRankedOffset(getStringFlag(ctx.args, "offset")),
  };
}

function rankedColumns() {
  return [
    { header: "Keyword", value: (row: RankedKeywordSuggestion) => row.keyword },
    { header: "Position", value: (row: RankedKeywordSuggestion) => row.position },
    { header: "Volume", value: (row: RankedKeywordSuggestion) => row.search_volume },
    { header: "Est. traffic", value: (row: RankedKeywordSuggestion) => row.estimated_traffic },
    {
      header: "Tracked",
      value: (row: RankedKeywordSuggestion) => (row.already_tracked ? "yes" : ""),
    },
  ];
}

function rankedPageLabel(response: RankedKeywordSuggestionsResponse) {
  if (response.rows.length === 0) return `empty at offset ${response.offset}`;
  return `${response.offset + 1}-${response.offset + response.rows.length}`;
}

function rankedHumanOutput(response: RankedKeywordSuggestionsResponse) {
  const footer: [string, string | number][] = [
    ["total", response.total_count ?? "unknown"],
    ["page", rankedPageLabel(response)],
    ["status", response.cached ? "cached" : "paid"],
  ];
  if (!response.cached) footer.push(["cost cents", response.cost_cents]);
  return `${renderTable(response.rows, rankedColumns())}\n${renderKeyValues(footer)}`;
}

function recordPaidLookup(ctx: CommandContext, response: RankedKeywordSuggestionsResponse) {
  if (response.cached) return 0;
  ctx.stderr.push(
    `Paid lookup: $${(response.cost_cents / 100).toFixed(2)} charged to your DataForSEO account (cached for 12h).\n`,
  );
  return response.cost_cents;
}

export async function commandKeywordsSuggestRanked(ctx: CommandContext) {
  const { client, settings } = await settingsAndClient(ctx);
  const projectId = await resolveProjectId(client, ctx, settings.projectId);
  const options = rankedSuggestionOptions(ctx);
  const all = hasFlag(ctx.args, "all");
  const first = await client.listRankedKeywordSuggestions(projectId, options);
  let paidCostCents = recordPaidLookup(ctx, first);
  if (!all) {
    return hasFlag(ctx.args, "json") ? renderJson(first) : rankedHumanOutput(first);
  }

  const rows = [...first.rows];
  let latest = first;
  let pages = 1;
  ctx.stderr.push(`Running cost: $${(paidCostCents / 100).toFixed(2)} after ${pages} page.\n`);
  while (
    latest.rows.length > 0 &&
    latest.offset < 900 &&
    (latest.total_count === null || latest.offset + latest.rows.length < latest.total_count)
  ) {
    const offset = latest.offset + 100;
    latest = await client.listRankedKeywordSuggestions(projectId, { ...options, offset });
    rows.push(...latest.rows);
    paidCostCents += recordPaidLookup(ctx, latest);
    pages += 1;
    ctx.stderr.push(`Running cost: $${(paidCostCents / 100).toFixed(2)} after ${pages} pages.\n`);
  }
  const combined: RankedKeywordSuggestionsResponse = {
    ...first,
    cached: paidCostCents === 0,
    cost_cents: paidCostCents,
    fetched_at: latest.fetched_at,
    rows,
  };
  return hasFlag(ctx.args, "json") ? renderJson(combined) : rankedHumanOutput(combined);
}

export async function commandKeywordsAdd(ctx: CommandContext, rest: readonly string[]) {
  const file = getStringFlag(ctx.args, "file");
  const fileKeywords = file
    ? (await readTextFile(ctx, file))
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"))
    : [];
  const keywordTexts = [...new Set([...rest, ...fileKeywords])];
  if (keywordTexts.length === 0) {
    throw new CliError("Pass at least one keyword.");
  }
  const { client, settings } = await settingsAndClient(ctx);
  const projectId = await resolveProjectId(client, ctx, settings.projectId);
  const device = parseDevice(getStringFlag(ctx.args, "device"));

  const tags = tagsFromArgs(ctx.args);
  const country = getStringFlag(ctx.args, "country");
  const location = getStringFlag(ctx.args, "location");
  const city = getStringFlag(ctx.args, "city");
  const locationKey = getStringFlag(ctx.args, "location-key");
  const intent = getStringFlag(ctx.args, "intent");
  const topic = getStringFlag(ctx.args, "topic");
  const targetUrl = getStringFlag(ctx.args, "target-url");
  const keywords = keywordTexts.map((keyword) => {
    const item: CreateKeywordInput = { keyword };
    if (country) {
      item.country = country;
    }
    if (device) {
      item.device = device;
    }
    if (location) {
      // The API reads `location` as the market country name and prefers it
      // over `country`. City-level targeting uses `city` or `location_key`.
      item.location = location;
    }
    if (city) {
      item.city = city;
    }
    if (locationKey) {
      item.location_key = locationKey;
    }
    if (intent) {
      item.intent = intent;
    }
    if (topic) {
      item.topic = topic;
    }
    if (tags.length) {
      item.tags = tags;
    }
    if (targetUrl) {
      item.target_url = targetUrl;
    }
    return item;
  });

  const result = await client.addKeywords(projectId, { keywords });
  if (hasFlag(ctx.args, "json")) {
    return renderJson(result);
  }
  return renderKeyValues([
    ["project", projectId],
    ["created", result.created],
    ["skipped", result.skipped],
    ["total", result.results.length],
  ]);
}

export async function commandKeywordsList(ctx: CommandContext) {
  const { client, settings } = await settingsAndClient(ctx);
  const projectId = await resolveProjectId(client, ctx, settings.projectId);
  const response = await collectKeywords(
    client,
    projectId,
    keywordFilters(ctx.args, 50),
    hasFlag(ctx.args, "all"),
  );
  if (hasFlag(ctx.args, "json")) {
    return renderJson(response);
  }
  return renderTable(response.data, keywordColumns());
}

export function keywordSummary(keyword: Keyword) {
  return renderKeyValues([
    ["keyword", keyword.id],
    ["text", keyword.text],
    ["device", keyword.device],
    ["country", keyword.country],
    ["location", keyword.location],
    ["intent", keyword.intent],
    ["topic", keyword.topic],
    ["tags", keyword.tags.join(",")],
    ["position", keyword.latest_position],
    ["target", keyword.target_url],
  ]);
}

export async function commandKeywordsGet(ctx: CommandContext, rest: readonly string[]) {
  const keywordId = assertPublicId(required(rest[0], "Pass a keyword ID."), "kw", "Keyword ID");
  const { client } = await settingsAndClient(ctx);
  const result = await client.getKeyword(keywordId);
  return hasFlag(ctx.args, "json") ? renderJson(result) : keywordSummary(result);
}

export function keywordUpdateInput(args: ParsedArgs) {
  const input: UpdateKeywordInput = {};
  const text = getStringFlag(args, "keyword");
  const device = parseDevice(getStringFlag(args, "device"));
  const country = getStringFlag(args, "country");
  const location = getStringFlag(args, "location");
  const city = getStringFlag(args, "city");
  const locationKey = getStringFlag(args, "location-key");
  const intent = getStringFlag(args, "intent");
  const topic = getStringFlag(args, "topic");
  const frequency = parseFrequency(getStringFlag(args, "frequency"), "--frequency");
  const targetUrl = getStringFlag(args, "target-url");
  const tags = tagsFromArgs(args);
  const clearTargetUrl = hasFlag(args, "clear-target-url");
  const clearIntent = hasFlag(args, "clear-intent");
  const clearTopic = hasFlag(args, "clear-topic");
  const clearCity = hasFlag(args, "clear-city");

  for (const [value, clear, flag] of [
    [targetUrl, clearTargetUrl, "target-url"],
    [intent, clearIntent, "intent"],
    [topic, clearTopic, "topic"],
    [city, clearCity, "city"],
  ] as const) {
    if (value !== undefined && clear) {
      throw new CliError(`--${flag} conflicts with --clear-${flag}.`);
    }
  }

  if (text) {
    input.keyword = text;
  }
  if (device) {
    input.device = device;
  }
  if (country) {
    input.country = country;
  }
  if (location) {
    // Same semantics as keywords add: `location` is the market country name.
    input.location = location;
  }
  if (clearCity) {
    input.city = null;
  } else if (city) {
    input.city = city;
  }
  if (locationKey) {
    input.location_key = locationKey;
  }
  if (clearIntent) {
    input.intent = null;
  } else if (intent) {
    input.intent = intent;
  }
  if (clearTopic) {
    input.topic = null;
  } else if (topic) {
    input.topic = topic;
  }
  if (frequency) {
    input.frequency = frequency;
  }
  if (clearTargetUrl) {
    input.target_url = null;
  } else if (targetUrl) {
    input.target_url = targetUrl;
  }
  if (tags.length) {
    input.tags = tags;
  }
  return input;
}

export async function commandKeywordsUpdate(ctx: CommandContext, rest: readonly string[]) {
  const keywordId = assertPublicId(required(rest[0], "Pass a keyword ID."), "kw", "Keyword ID");
  const input = keywordUpdateInput(ctx.args);
  if (!hasOwnProperties(input)) {
    throw new CliError("Pass at least one keyword field flag to update.");
  }
  const { client } = await settingsAndClient(ctx);
  const result = await client.updateKeyword(keywordId, input);
  return hasFlag(ctx.args, "json") ? renderJson(result) : keywordSummary(result);
}

export async function commandKeywordsDelete(ctx: CommandContext, rest: readonly string[]) {
  const keywordId = assertPublicId(required(rest[0], "Pass a keyword ID."), "kw", "Keyword ID");
  const { client } = await settingsAndClient(ctx);
  const result = await client.deleteKeyword(keywordId);
  if (hasFlag(ctx.args, "json")) {
    return renderJson(result ?? null);
  }
  if (!result) {
    return renderKeyValues([["deleted", keywordId]]);
  }
  return renderKeyValues([
    ["deleted", result.id],
    ["text", result.text],
  ]);
}

export const BULK_OPERATIONS = [
  "add_tags",
  "delete",
  "remove_tags",
  "set_frequency",
  "set_target_url",
] as const;

export function keywordBulkInput(ctx: CommandContext, rest: readonly string[]): KeywordBulkInput {
  const inputJson = getStringFlag(ctx.args, "input-json");
  if (inputJson) {
    const input = parseJsonObject(inputJson, "--input-json") as unknown as KeywordBulkInput;
    validateKeywordBulkInput(input as Record<string, unknown>, "--input-json");
    return input;
  }

  const operation = required(
    rest[0],
    `Pass a bulk operation: ${BULK_OPERATIONS.join(", ")}.`,
  ) as (typeof BULK_OPERATIONS)[number];
  if (!(BULK_OPERATIONS as readonly string[]).includes(operation)) {
    throw new CliError(`Bulk operation must be one of ${BULK_OPERATIONS.join(", ")}.`);
  }
  const keywordIds = publicIdList(stringListFromArgs(ctx.args, "id", "ids"), "kw", "Keyword ID");
  if (!keywordIds.length) {
    throw new CliError("Pass at least one keyword ID with --id or --ids.");
  }

  if (operation === "add_tags" || operation === "remove_tags") {
    const tags = tagsFromArgs(ctx.args);
    if (!tags.length) {
      throw new CliError(`${operation} requires --tag or --tags.`);
    }
    return { keyword_ids: keywordIds, operation, tags };
  }
  if (operation === "set_frequency") {
    const frequency = parseFrequency(getStringFlag(ctx.args, "frequency"), "--frequency");
    if (!frequency) {
      throw new CliError("set_frequency requires --frequency.");
    }
    return { frequency, keyword_ids: keywordIds, operation };
  }
  if (operation === "set_target_url") {
    const targetUrl = getStringFlag(ctx.args, "target-url");
    return { keyword_ids: keywordIds, operation, target_url: targetUrl ?? null };
  }
  return { keyword_ids: keywordIds, operation };
}

export async function commandKeywordsBulk(ctx: CommandContext, rest: readonly string[]) {
  const input = keywordBulkInput(ctx, rest);
  const { client } = await settingsAndClient(ctx);
  const result = await client.bulkUpdateKeywords(input);
  if (hasFlag(ctx.args, "json")) {
    return renderJson(result);
  }
  return renderTable(result.results, [
    { header: "keyword_id", value: (row) => row.keyword_id },
    { header: "status", value: (row) => row.status },
  ]);
}

export const handlers = {
  add: commandKeywordsAdd,
  bulk: commandKeywordsBulk,
  delete: commandKeywordsDelete,
  get: commandKeywordsGet,
  list: commandKeywordsList,
  match: commandKeywordsMatch,
  metrics: commandKeywordsMetrics,
  research: commandKeywordsResearch,
  "suggest-ranked": commandKeywordsSuggestRanked,
  update: commandKeywordsUpdate,
};
