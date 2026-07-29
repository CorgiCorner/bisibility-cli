import { Buffer } from "node:buffer";
import { createInterface } from "node:readline/promises";
import type {
  AlertChannel,
  AlertConditionType,
  AlertTargetType,
  ConnectProviderInput,
  CreateAlertRuleInput,
  CreateSavedViewInput,
  Keyword,
  ListKeywordsOptions,
  ListResponse,
  PaginationOptions,
  Project,
  RankCheck,
  RankCheckFrequency,
  RankCheckStatus,
  UpdateNotificationPreferencesInput,
} from "@bisibility/sdk";
import { BisibilityClient } from "@bisibility/sdk";
import {
  type ConfigDeps,
  findProjectLink,
  loadSettings,
  readConfigFile,
  writeConfigFile,
} from "./config.js";
import { type ParsedArgs, getStringFlag, getStringFlags, hasFlag } from "./parser.js";
import {
  type PublicIdForPrefix,
  assertPublicId,
  publicIdList,
  validateAlertTargetInput,
} from "./public-id.js";

export type Client = InstanceType<typeof BisibilityClient>;
type ProjectId = PublicIdForPrefix<"prj">;
type SelectedProject = Project & { id: ProjectId };

export type FetchLike = typeof globalThis.fetch;

export type CliDeps = ConfigDeps & {
  fetch?: FetchLike;
  hostName?: () => string;
  now?: () => Date;
  onProgress?: (message: string) => void;
  oauthTimeoutMs?: number;
  openBrowser?: (url: string) => Promise<void>;
  projectSelector?: (projects: readonly Project[]) => Promise<string | undefined>;
  readStdin?: () => Promise<string>;
};

export type CliResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

export type CommandContext = {
  args: ParsedArgs;
  deps: CliDeps;
  progress: (message: string) => void;
  stderr: string[];
};

export type ExportDocument = {
  exported_at: string;
  keywords: Keyword[];
  project_id: string;
  rank_checks: RankCheck[];
  source: {
    base_url: string;
  };
  version: 1;
};

export type KeywordSort = NonNullable<ListKeywordsOptions["sort"]>;
export type JsonRecord = Record<string, unknown>;

export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function isDevice(value: string | undefined): value is "desktop" | "mobile" {
  return value === "desktop" || value === "mobile";
}

export const RANK_CHECK_FREQUENCIES = [
  "paused",
  "manual",
  "daily",
  "weekly",
  "monthly",
  "custom_cron",
] as const;

export function parseFrequency(value: string | undefined, name: string) {
  if (value === undefined) {
    return undefined;
  }
  if (!(RANK_CHECK_FREQUENCIES as readonly string[]).includes(value)) {
    throw new CliError(`${name} must be one of ${RANK_CHECK_FREQUENCIES.join(", ")}.`);
  }
  return value as RankCheckFrequency;
}

export const RANK_CHECK_STATUSES = ["completed", "failed", "running"] as const;

export function parseRankCheckStatus(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  if (!(RANK_CHECK_STATUSES as readonly string[]).includes(value)) {
    throw new CliError(`--status must be one of ${RANK_CHECK_STATUSES.join(", ")}.`);
  }
  return value as RankCheckStatus;
}

export function parseIsoDate(value: string | undefined, name: string) {
  if (value === undefined) {
    return undefined;
  }
  if (Number.isNaN(Date.parse(value))) {
    throw new CliError(`${name} must be a valid ISO-8601 date-time.`);
  }
  return value;
}

export function parseDevice(value: string | undefined) {
  if (value !== undefined && !isDevice(value)) {
    throw new CliError("--device must be desktop or mobile.");
  }
  return value;
}

export function parsePositiveInt(value: string | undefined, name: string, fallback: number) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function parseFormat(format = "json") {
  if (format !== "json" && format !== "csv") {
    throw new CliError("--format must be json or csv.");
  }
  return format;
}

export function required(value: string | undefined, message: string) {
  if (!value) {
    throw new CliError(message);
  }
  return value;
}

export function tagsFromArgs(args: ParsedArgs) {
  const repeated = getStringFlags(args, "tag");
  const commaSeparated = getStringFlags(args, "tags").flatMap((value) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
  return [...new Set([...repeated, ...commaSeparated])];
}

export async function settingsAndClient(ctx: CommandContext, requiresApiKey = true) {
  const settings = await loadSettings(ctx.args, ctx.deps);
  if (requiresApiKey && !settings.apiKey) {
    throw new CliError(
      "API key is required. Set BISIBILITY_API_KEY or run bisibility config set apiKey <key>.",
    );
  }
  const projectId = settings.projectId
    ? assertPublicId(settings.projectId, "prj", "Configured project ID")
    : undefined;
  const client = new BisibilityClient({
    ...(settings.apiKey ? { apiKey: settings.apiKey } : {}),
    baseUrl: settings.baseUrl,
    ...(projectId ? { projectId } : {}),
  });
  return { client, settings };
}

export async function resolveProjectId(
  client: Client,
  ctx: CommandContext,
  configured?: string,
): Promise<ProjectId> {
  const projectId = getStringFlag(ctx.args, "project") ?? configured;
  if (projectId) {
    return assertPublicId(projectId, "prj", "Project ID");
  }
  const projects = await client.listProjects();
  if (projects.data.length === 0) {
    throw new CliError("No project was returned by the API. Pass --project <id>.");
  }
  if (projects.data.length > 1) {
    throw new CliError(
      "Multiple projects are available. Run bisibility projects use <id>, bisibility link, or pass --project <id>.",
    );
  }
  const onlyProject = projects.data[0];
  if (!onlyProject) {
    throw new CliError("No project was returned by the API. Pass --project <id>.");
  }
  return assertPublicId(onlyProject.id, "prj", "Resolved project ID");
}

function selectedProject(project: Project): SelectedProject {
  return { ...project, id: assertPublicId(project.id, "prj", "Selected project ID") };
}

export function projectByReference(
  projects: readonly Project[],
  reference: string,
): SelectedProject {
  const normalized = reference.trim().toLowerCase();
  const exactId = projects.find((project) => project.id === reference);
  if (exactId) {
    return selectedProject(exactId);
  }
  const matches = projects.filter(
    (project) =>
      project.name.toLowerCase() === normalized || project.domain.toLowerCase() === normalized,
  );
  if (matches.length === 1) {
    const match = matches[0];
    if (match) {
      return selectedProject(match);
    }
  }
  if (matches.length > 1) {
    throw new CliError(
      `Project reference "${reference}" is ambiguous. Use one of: ${matches.map((project) => project.id).join(", ")}.`,
    );
  }
  throw new CliError(`Project "${reference}" was not found in your memberships.`);
}

export async function promptForProject(projects: readonly Project[]) {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    throw new CliError(
      "Project selection requires an interactive terminal. Pass a project ID explicitly.",
    );
  }
  process.stderr.write(
    `${projects.map((project, index) => `${index + 1}. ${project.name} (${project.domain}) [${project.id}]`).join("\n")}\n`,
  );
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = (await prompt.question("Select project by number or ID: ")).trim();
    const index = Number(answer);
    if (Number.isInteger(index) && index >= 1 && index <= projects.length) {
      return projects[index - 1]?.id;
    }
    return answer || undefined;
  } finally {
    prompt.close();
  }
}

export async function chooseProject(
  ctx: CommandContext,
  projects: readonly Project[],
  reference?: string,
): Promise<SelectedProject> {
  if (projects.length === 0) {
    throw new CliError("No project was returned by the API. Create a project first.");
  }
  if (reference) {
    return projectByReference(projects, reference);
  }
  if (projects.length === 1) {
    const project = projects[0];
    if (project) {
      return selectedProject(project);
    }
  }
  const selected = await (ctx.deps.projectSelector ?? promptForProject)(projects);
  if (!selected) {
    throw new CliError("Project selection was cancelled.");
  }
  return projectByReference(projects, selected);
}

export async function saveGlobalProject(ctx: CommandContext, projectId: ProjectId) {
  const config = await readConfigFile(ctx.args, ctx.deps);
  const configPath = await writeConfigFile(ctx.args, { ...config, projectId }, ctx.deps);
  return { configPath, localLink: await findProjectLink(ctx.deps) };
}

export function keywordFilters(args: ParsedArgs, limitFallback: number) {
  const limit = parsePositiveInt(getStringFlag(args, "limit"), "--limit", limitFallback);
  const device = getStringFlag(args, "device");
  if (device !== undefined && !isDevice(device)) {
    throw new CliError("--device must be desktop or mobile.");
  }

  const filters: ListKeywordsOptions = { limit };
  const cursor = getStringFlag(args, "cursor");
  const country = getStringFlag(args, "country");
  const intent = getStringFlag(args, "intent");
  const search = getStringFlag(args, "search");
  const sort = getStringFlag(args, "sort");
  const tag = getStringFlag(args, "tag");
  const topic = getStringFlag(args, "topic");
  if (cursor) {
    filters.cursor = cursor;
  }
  if (country) {
    filters.country = country;
  }
  if (device) {
    filters.device = device;
  }
  if (intent) {
    filters.intent = intent;
  }
  if (search) {
    filters.search = search;
  }
  if (sort) {
    filters.sort = sort as KeywordSort;
  }
  if (tag) {
    filters.tag = tag;
  }
  if (topic) {
    filters.topic = topic;
  }
  return filters;
}

export function paginationOptions(args: ParsedArgs, limitFallback = 50) {
  const options: PaginationOptions = {
    limit: parsePositiveInt(getStringFlag(args, "limit"), "--limit", limitFallback),
  };
  const cursor = getStringFlag(args, "cursor");
  if (cursor) {
    options.cursor = cursor;
  }
  return options;
}

export function parseNumber(value: string | undefined, name: string) {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new CliError(`${name} must be a number.`);
  }
  return parsed;
}

export function parseOptionalPositiveInt(value: string | undefined, name: string) {
  if (value === undefined) {
    return undefined;
  }
  return parsePositiveInt(value, name, 1);
}

export function parseBoolean(value: string | undefined, name: string) {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  throw new CliError(`${name} must be true or false.`);
}

export function stringListFromArgs(args: ParsedArgs, singular: string, plural: string) {
  const repeated = getStringFlags(args, singular);
  const commaSeparated = getStringFlags(args, plural).flatMap((value) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
  return [...new Set([...repeated, ...commaSeparated])];
}

export function parseJsonObject(raw: string, name: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON.";
    throw new CliError(`${name} must be valid JSON: ${message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliError(`${name} must be a JSON object.`);
  }
  return parsed as JsonRecord;
}

export const SIGNAL_PAYLOAD_LIMIT_BYTES = 8 * 1024;

export function parseSignalPayload(raw: string) {
  const payload = parseJsonObject(raw, "--payload");
  const size = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (size > SIGNAL_PAYLOAD_LIMIT_BYTES) {
    throw new CliError(
      `--payload must serialize to ${SIGNAL_PAYLOAD_LIMIT_BYTES} bytes (8KB) or less; got ${size} bytes.`,
    );
  }
  return payload;
}

export function hasOwnProperties(value: object) {
  return Object.keys(value).length > 0;
}

export async function collectPaginated<T, R extends ListResponse<T>>(
  fetchPage: (options: PaginationOptions) => Promise<R>,
  options: PaginationOptions,
  all: boolean,
) {
  const first = await fetchPage(options);
  if (!all) {
    return first;
  }

  const data = [...first.data];
  let cursor = first.meta.next_cursor;
  while (cursor) {
    const page = await fetchPage({ ...options, cursor });
    data.push(...page.data);
    cursor = page.meta.next_cursor;
  }
  return {
    ...first,
    data,
    meta: { ...first.meta, count: data.length, next_cursor: null },
  } as R;
}

export function alertRuleInput(args: ParsedArgs, commandName: string) {
  const inputJson = getStringFlag(args, "input-json");
  const input: Partial<CreateAlertRuleInput> = inputJson
    ? (parseJsonObject(inputJson, "--input-json") as Partial<CreateAlertRuleInput>)
    : {};
  const name = getStringFlag(args, "name");
  const condition = getStringFlag(args, "condition-type") ?? getStringFlag(args, "condition");
  const targetType = getStringFlag(args, "target-type");
  const channels = stringListFromArgs(args, "channel", "channels");
  const targetIds = stringListFromArgs(args, "target-id", "target-ids");
  const enabled = parseBoolean(getStringFlag(args, "enabled"), "--enabled");
  const thresholdPosition = parseOptionalPositiveInt(
    getStringFlag(args, "threshold-position"),
    "--threshold-position",
  );
  const topN = parseOptionalPositiveInt(getStringFlag(args, "top-n"), "--top-n");
  const changePct = parseNumber(getStringFlag(args, "change-pct"), "--change-pct");
  const competitorDomain = getStringFlag(args, "competitor-domain");
  const serpFeature = getStringFlag(args, "serp-feature");

  if (name) {
    input.name = name;
  }
  if (condition) {
    input.condition_type = condition as AlertConditionType;
  }
  if (targetType) {
    input.target_type = targetType as AlertTargetType;
  }
  if (channels.length) {
    input.channels = channels as AlertChannel[];
  }
  if (targetIds.length) {
    if (targetType === "keyword") {
      input.target_ids = publicIdList(targetIds, "kw", `${commandName} keyword target ID`);
    } else if (targetType === "tag") {
      input.target_ids = publicIdList(targetIds, "tag", `${commandName} tag target ID`);
    } else {
      throw new CliError(`${commandName} target IDs require --target-type keyword or tag.`);
    }
  }
  if (enabled !== undefined) {
    input.enabled = enabled;
  }
  if (hasFlag(args, "disabled")) {
    input.enabled = false;
  }
  if (thresholdPosition !== undefined) {
    input.threshold_position = thresholdPosition;
  }
  if (topN !== undefined) {
    input.top_n = topN;
  }
  if (changePct !== undefined) {
    input.change_pct = changePct;
  }
  if (competitorDomain) {
    input.competitor_domain = competitorDomain;
  }
  if (serpFeature) {
    input.serp_feature = serpFeature;
  }

  if (!input.name) {
    throw new CliError(`${commandName} requires --name or --input-json with name.`);
  }
  if (!input.condition_type) {
    throw new CliError(`${commandName} requires --condition or --input-json with condition_type.`);
  }
  validateAlertTargetInput(input as Record<string, unknown>, commandName);
  return input as CreateAlertRuleInput;
}

export function providerCredentials(args: ParsedArgs) {
  const credentials: Record<string, string> = {};
  const apiKey = getStringFlag(args, "provider-api-key");
  if (apiKey) {
    credentials.api_key = apiKey;
  }
  const endpoint = getStringFlag(args, "endpoint");
  if (endpoint) {
    credentials.endpoint = endpoint;
  }
  for (const credential of getStringFlags(args, "credential")) {
    const equalsIndex = credential.indexOf("=");
    if (equalsIndex <= 0) {
      throw new CliError("--credential must use name=value.");
    }
    const key = credential.slice(0, equalsIndex).trim();
    const value = credential.slice(equalsIndex + 1);
    if (!key) {
      throw new CliError("--credential must use a non-empty name.");
    }
    credentials[key] = value;
  }
  return credentials;
}

export function providerConnectInput(args: ParsedArgs) {
  const input: ConnectProviderInput = {};
  const login = getStringFlag(args, "login");
  const secret = getStringFlag(args, "secret");
  const costPerCheck = parseNumber(getStringFlag(args, "cost-per-check"), "--cost-per-check");
  const priority = parseOptionalPositiveInt(getStringFlag(args, "priority"), "--priority");
  const enabled = parseBoolean(getStringFlag(args, "enabled"), "--enabled");
  const credentials = providerCredentials(args);

  if (login) {
    input.login = login;
  }
  if (secret) {
    input.secret = secret;
  }
  if (hasOwnProperties(credentials)) {
    input.credentials = credentials;
  }
  if (costPerCheck !== undefined) {
    input.cost_per_check = costPerCheck;
  }
  if (priority !== undefined) {
    input.priority = priority;
  }
  if (enabled !== undefined) {
    input.enabled = enabled;
  }
  if (hasFlag(args, "primary")) {
    input.primary = true;
  }
  return input;
}

export function providerTestInput(args: ParsedArgs) {
  const input = {
    credentials: providerCredentials(args),
    login: getStringFlag(args, "login"),
    secret: getStringFlag(args, "secret"),
  };
  return {
    ...(hasOwnProperties(input.credentials) ? { credentials: input.credentials } : {}),
    ...(input.login ? { login: input.login } : {}),
    ...(input.secret ? { secret: input.secret } : {}),
  };
}

export async function savedViewInput(ctx: CommandContext) {
  const name = required(getStringFlag(ctx.args, "name"), "views create requires --name.");
  const inlineConfig = getStringFlag(ctx.args, "config-json");
  const configFile = getStringFlag(ctx.args, "config-file");
  if (inlineConfig && configFile) {
    throw new CliError("Pass either --config-json or --config-file, not both.");
  }
  const rawConfig = inlineConfig ?? (configFile ? await readTextFile(ctx, configFile) : undefined);
  if (!rawConfig) {
    throw new CliError("views create requires --config-json or --config-file.");
  }
  const config = parseJsonObject(
    rawConfig,
    inlineConfig ? "--config-json" : "--config-file",
  ) as unknown as CreateSavedViewInput["config"];
  return {
    config,
    name,
  };
}

export async function readTextFile(ctx: CommandContext, file: string) {
  if (file === "-") {
    if (ctx.deps.readStdin) {
      return ctx.deps.readStdin();
    }
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  const read = ctx.deps.readFile ?? (await import("node:fs/promises")).readFile;
  return read(file, "utf8");
}

export function notificationInput(args: ParsedArgs) {
  const mappings = [
    ["alert-email", "alert_email"],
    ["alert-in-app", "alert_in_app"],
    ["alert-slack", "alert_slack"],
    ["alert-webhook", "alert_webhook"],
    ["check-email", "check_email"],
    ["check-in-app", "check_in_app"],
    ["import-email", "import_email"],
    ["import-in-app", "import_in_app"],
    ["invite-email", "invite_email"],
    ["invite-in-app", "invite_in_app"],
  ] as const;
  const input: UpdateNotificationPreferencesInput = {};
  for (const [flag, key] of mappings) {
    const value = parseBoolean(getStringFlag(args, flag), `--${flag}`);
    if (value !== undefined) {
      input[key] = value;
    }
  }
  return input;
}

export async function collectKeywords(
  client: Client,
  projectId: ProjectId,
  filters: ListKeywordsOptions,
  all: boolean,
) {
  return collectPaginated(
    (options) => client.listKeywords(projectId, { ...filters, ...options }),
    filters,
    all,
  );
}

export async function collectRankChecks(
  client: Client,
  keywords: readonly Keyword[],
  limit: number,
) {
  const results = await mapWithConcurrency(keywords, 5, async (keyword) => {
    const checks: RankCheck[] = [];
    let cursor: string | null | undefined;
    do {
      const options = cursor ? { cursor, limit } : { limit };
      const page = await client.listRankChecks(keyword.id, options);
      checks.push(...page.data);
      cursor = page.meta.next_cursor;
    } while (cursor);
    return checks;
  });
  return results.flat();
}

export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value !== undefined) {
        results[index] = await mapper(value, index);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

export function keywordColumns() {
  return [
    { header: "id", value: (keyword: Keyword) => keyword.id },
    { header: "keyword", value: (keyword: Keyword) => keyword.text },
    { header: "device", value: (keyword: Keyword) => keyword.device },
    { header: "location", value: (keyword: Keyword) => keyword.location },
    { header: "position", value: (keyword: Keyword) => keyword.latest_position },
    { header: "target", value: (keyword: Keyword) => keyword.target_url },
  ];
}

export function rankCheckRows(keywords: readonly Keyword[], checks: readonly RankCheck[]) {
  const checksByKeyword = new Map<string, RankCheck[]>();
  for (const check of checks) {
    const current = checksByKeyword.get(check.keyword_id) ?? [];
    current.push(check);
    checksByKeyword.set(check.keyword_id, current);
  }

  const rows: Record<string, unknown>[] = [];
  for (const keyword of keywords) {
    const keywordChecks = checksByKeyword.get(keyword.id);
    const base = {
      country: keyword.country,
      created_at: keyword.created_at,
      device: keyword.device,
      keyword: keyword.text,
      keyword_id: keyword.id,
      latest_position: keyword.latest_position,
      location: keyword.location,
      project_id: keyword.project_id,
      ranking_url: keyword.ranking_url,
      tags: keyword.tags,
      target_url: keyword.target_url,
      updated_at: keyword.updated_at,
    };
    if (!keywordChecks?.length) {
      rows.push(base);
      continue;
    }
    for (const check of keywordChecks) {
      rows.push({
        ...base,
        check_error: check.error,
        check_id: check.id,
        check_ranking_url: check.ranking_url,
        checked_at: check.checked_at,
        cost_cents: check.cost_cents,
        position: check.position,
        previous_position: check.previous_position,
        provider: check.provider,
        status: check.status,
      });
    }
  }
  return rows;
}

export function exportHeaders() {
  return [
    "keyword_id",
    "keyword",
    "project_id",
    "country",
    "location",
    "device",
    "tags",
    "target_url",
    "latest_position",
    "ranking_url",
    "created_at",
    "updated_at",
    "check_id",
    "checked_at",
    "position",
    "previous_position",
    "provider",
    "check_ranking_url",
    "cost_cents",
    "status",
    "check_error",
  ];
}

export async function writeOrReturn(ctx: CommandContext, text: string) {
  const output = getStringFlag(ctx.args, "out") ?? getStringFlag(ctx.args, "output");
  if (!output) {
    return text;
  }
  const write = ctx.deps.writeFile ?? (await import("node:fs/promises")).writeFile;
  await write(output, text, "utf8");
  return `Wrote ${output}\n`;
}

export function yesNo(value: boolean | null | undefined) {
  if (value === null || value === undefined) {
    return undefined;
  }
  return value ? "yes" : "no";
}
