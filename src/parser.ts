export type FlagPrimitive = boolean | string;

export type ParsedArgs = {
  flags: Map<string, FlagPrimitive[]>;
  positionals: string[];
};

const aliases = new Map<string, string>([
  ["-c", "config"],
  ["-f", "format"],
  ["-h", "help"],
  ["-o", "output"],
  ["-p", "project"],
  ["-v", "version"],
]);

export const booleanFlags = new Set([
  "all",
  "async",
  "clear-city",
  "clear-cron-expression",
  "clear-intent",
  "clear-target-url",
  "clear-topic",
  "check",
  "clickstream",
  "csv",
  "disabled",
  "dry-run",
  "estimate",
  "fresh",
  "global",
  "help",
  "json",
  "no-history",
  "offline",
  "off",
  "no-subdomains",
  "page",
  "primary",
  "revoke",
  "use",
  "version",
]);

export const valueFlags = new Set([
  "api-key",
  "alert-email",
  "alert-in-app",
  "alert-slack",
  "alert-webhook",
  "base-url",
  "change-pct",
  "channel",
  "channels",
  "check-email",
  "check-in-app",
  "city",
  "cloud-url",
  "competitor-domain",
  "connection",
  "config",
  "config-file",
  "config-json",
  "condition",
  "condition-type",
  "cost-per-check",
  "country",
  "credential",
  "cron-expression",
  "cursor",
  "device",
  "devices",
  "domain",
  "email",
  "enabled",
  "endpoint",
  "end-date",
  "expires",
  "format",
  "frequency",
  "file",
  "from",
  "granularity",
  "happened-at",
  "history-limit",
  "id",
  "idempotency-key",
  "ids",
  "import-email",
  "import-in-app",
  "input-json",
  "intent",
  "invite-email",
  "invite-in-app",
  "jitter-minutes",
  "keyword",
  "keyword-id",
  "keyword-ids",
  "keywords",
  "label",
  "limit",
  "login",
  "location",
  "location-key",
  "locations",
  "max-cost",
  "mode",
  "name",
  "option",
  "offset",
  "out",
  "output",
  "payload",
  "path",
  "paths",
  "plan",
  "project",
  "priority",
  "provider",
  "provider-api-key",
  "provider-id",
  "query",
  "range",
  "role",
  "scope",
  "search",
  "secret",
  "serp-feature",
  "severity",
  "since",
  "sort",
  "source",
  "start-date",
  "status",
  "tag",
  "tags",
  "target-id",
  "target-ids",
  "target-type",
  "target-url",
  "threshold-position",
  "timezone",
  "tracking-scope",
  "to",
  "token",
  "top-n",
  "topic",
  "type",
  "until",
  "url",
  "view",
]);

export class ArgParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgParseError";
  }
}

function normalizeFlagName(raw: string) {
  return raw.replace(/^--?/, "");
}

function pushFlag(flags: Map<string, FlagPrimitive[]>, name: string, value: FlagPrimitive) {
  const current = flags.get(name);
  if (current) {
    current.push(value);
    return;
  }
  flags.set(name, [value]);
}

function parseLongOption(
  argv: readonly string[],
  index: number,
  token: string,
  flags: Map<string, FlagPrimitive[]>,
) {
  const equalsIndex = token.indexOf("=");
  const rawName = equalsIndex >= 0 ? token.slice(0, equalsIndex) : token;
  const name = normalizeFlagName(rawName);
  if (!name) {
    throw new ArgParseError("Invalid empty option name.");
  }
  if (!booleanFlags.has(name) && !valueFlags.has(name)) {
    throw new ArgParseError(`Unknown long option --${name}.`);
  }
  if (equalsIndex >= 0) {
    pushFlag(flags, name, token.slice(equalsIndex + 1));
    return index;
  }
  if (booleanFlags.has(name)) {
    pushFlag(flags, name, true);
    return index;
  }
  const next = argv[index + 1];
  if (next === undefined || (next.startsWith("-") && next !== "-")) {
    if (valueFlags.has(name)) {
      throw new ArgParseError(`Option --${name} requires a value.`);
    }
    pushFlag(flags, name, true);
    return index;
  }
  pushFlag(flags, name, next);
  return index + 1;
}

function parseShortOption(
  argv: readonly string[],
  index: number,
  token: string,
  flags: Map<string, FlagPrimitive[]>,
) {
  const alias = aliases.get(token);
  if (!alias) {
    throw new ArgParseError(`Unknown short option ${token}.`);
  }
  if (booleanFlags.has(alias)) {
    pushFlag(flags, alias, true);
    return index;
  }
  const next = argv[index + 1];
  if (next === undefined || (next.startsWith("-") && next !== "-")) {
    throw new ArgParseError(`Option ${token} requires a value.`);
  }
  pushFlag(flags, alias, next);
  return index + 1;
}

export function parseArgv(argv: readonly string[]): ParsedArgs {
  const flags = new Map<string, FlagPrimitive[]>();
  const positionals: string[] = [];

  let index = 0;
  while (index < argv.length) {
    const token = argv[index];
    if (token === undefined) {
      index += 1;
      continue;
    }
    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (!token.startsWith("-") || token === "-") {
      positionals.push(token);
      index += 1;
      continue;
    }

    const lastConsumedIndex = token.startsWith("--")
      ? parseLongOption(argv, index, token, flags)
      : parseShortOption(argv, index, token, flags);
    index = lastConsumedIndex + 1;
  }

  return { flags, positionals };
}

export function hasFlag(args: ParsedArgs, name: string) {
  return args.flags.has(name);
}

export function getStringFlag(args: ParsedArgs, name: string) {
  const values = args.flags.get(name);
  const value = values?.at(-1);
  return typeof value === "string" ? value : undefined;
}

export function getStringFlags(args: ParsedArgs, name: string) {
  return (args.flags.get(name) ?? []).filter((value): value is string => typeof value === "string");
}
