import { type ParsedArgs, getStringFlag, getStringFlags } from "./parser.js";

export const PUBLIC_ID_PREFIXES = [
  "al",
  "alr",
  "audit",
  "check",
  "cmp",
  "conn",
  "dwh",
  "ferry",
  "imp",
  "inv",
  "key",
  "kw",
  "mbr",
  "ntf",
  "pat",
  "prj",
  "sid",
  "sig",
  "svkw",
  "tag",
  "usr",
  "viw",
  "we",
] as const;

export type PublicIdPrefix = (typeof PUBLIC_ID_PREFIXES)[number];
export type PublicIdForPrefix<Prefix extends PublicIdPrefix> = `${Prefix}_${string}`;

const suffixPattern = "[a-z][a-z0-9]{23}";
const anyPrefixPattern = PUBLIC_ID_PREFIXES.join("|");
const rawCuidPattern = /^c[a-z0-9]{24}$/;

export const PUBLIC_ID_V3_PATTERN = new RegExp(`^(?:${anyPrefixPattern})_${suffixPattern}$`);

function isPublicIdOfType<Prefix extends PublicIdPrefix>(
  value: string,
  prefix: Prefix,
): value is PublicIdForPrefix<Prefix> {
  return PUBLIC_ID_V3_PATTERN.test(value) && value.startsWith(`${prefix}_`);
}

export function assertPublicId<Prefix extends PublicIdPrefix>(
  value: string,
  prefix: Prefix,
  label: string,
): PublicIdForPrefix<Prefix> {
  if (isPublicIdOfType(value, prefix)) {
    return value;
  }
  if (rawCuidPattern.test(value)) {
    throw new Error(`${label} must use a public ID v3. Raw or legacy IDs are not accepted.`);
  }
  throw new Error(
    `${label} must be a ${prefix}_ public ID v3 with a lowercase 24-character suffix.`,
  );
}

export function optionalPublicId<Prefix extends PublicIdPrefix>(
  value: string | undefined,
  prefix: Prefix,
  label: string,
) {
  return value === undefined ? undefined : assertPublicId(value, prefix, label);
}

export function publicIdList<Prefix extends PublicIdPrefix>(
  values: readonly string[],
  prefix: Prefix,
  label: string,
) {
  return values.map((value, index) => assertPublicId(value, prefix, `${label} ${index + 1}`));
}

function assertOptionalPosition(value: string | undefined, prefix: PublicIdPrefix, label: string) {
  if (value !== undefined) {
    assertPublicId(value, prefix, label);
  }
}

function assertFlagIds(args: ParsedArgs, flag: string, prefix: PublicIdPrefix, label: string) {
  for (const value of getStringFlags(args, flag)) {
    assertPublicId(value, prefix, `--${flag} ${label}`);
  }
}

function assertCommaSeparatedFlagIds(
  args: ParsedArgs,
  flag: string,
  prefix: PublicIdPrefix,
  label: string,
) {
  for (const raw of getStringFlags(args, flag)) {
    for (const value of raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)) {
      assertPublicId(value, prefix, `--${flag} ${label}`);
    }
  }
}

function assertProjectReference(value: string | undefined, label: string) {
  if (value === undefined) {
    return;
  }
  if (PUBLIC_ID_V3_PATTERN.test(value)) {
    assertPublicId(value, "prj", label);
    return;
  }
  if (rawCuidPattern.test(value) || new RegExp(`^(?:${anyPrefixPattern})_`).test(value)) {
    assertPublicId(value, "prj", label);
  }
}

export function validateAlertTargetInput(input: Record<string, unknown>, label: string) {
  const targetIds = input.target_ids;
  if (targetIds === undefined) {
    return;
  }
  if (!Array.isArray(targetIds) || !targetIds.every((value) => typeof value === "string")) {
    throw new Error(`${label} target_ids must be an array of public IDs.`);
  }
  if (targetIds.length === 0) {
    return;
  }
  if (input.target_type === "keyword") {
    for (const targetId of targetIds) {
      assertPublicId(targetId, "kw", `${label} keyword target ID`);
    }
    return;
  }
  if (input.target_type === "tag") {
    for (const targetId of targetIds) {
      assertPublicId(targetId, "tag", `${label} tag target ID`);
    }
    return;
  }
  throw new Error(`${label} target_ids require target_type keyword or tag.`);
}

export function validateKeywordBulkInput(input: Record<string, unknown>, label: string) {
  const keywordIds = input.keyword_ids;
  if (keywordIds === undefined) {
    return;
  }
  if (!Array.isArray(keywordIds) || !keywordIds.every((value) => typeof value === "string")) {
    throw new Error(`${label} keyword_ids must be an array of public IDs.`);
  }
  for (const keywordId of keywordIds) {
    assertPublicId(keywordId, "kw", `${label} keyword ID`);
  }
}

export function validatePublicIdArgs(args: ParsedArgs) {
  const [command, action, positionalId] = args.positionals;

  const projectReferenceCommand =
    command === "link" || (command === "projects" && (action === "use" || action === "switch"));
  if (!projectReferenceCommand) {
    assertFlagIds(args, "project", "prj", "project ID");
  }
  assertFlagIds(args, "connection", "conn", "connection ID");
  assertFlagIds(args, "keyword-id", "kw", "keyword ID");
  assertCommaSeparatedFlagIds(args, "keyword-ids", "kw", "keyword ID");
  const locationKey = getStringFlag(args, "location-key");
  if (locationKey?.startsWith("loc_")) {
    throw new Error("--location-key accepts a canonical location_key, not a loc_ resource ID.");
  }

  if (command === "alerts") {
    if (action === "mute") assertOptionalPosition(positionalId, "al", "Triggered alert ID");
    if (action === "update" || action === "delete") {
      assertOptionalPosition(positionalId, "alr", "Alert rule ID");
    }
    return;
  }

  if (command === "api-keys" && action === "revoke") {
    assertOptionalPosition(positionalId, "key", "API key ID");
    return;
  }

  if (command === "check") {
    if (action === "get") {
      assertOptionalPosition(positionalId, "check", "Rank check ID");
    } else if (action === "list" || action === "run") {
      assertOptionalPosition(positionalId, "kw", "Keyword ID");
    } else {
      assertOptionalPosition(action, "kw", "Keyword ID");
    }
    return;
  }

  if (command === "competitors" && action === "remove") {
    assertOptionalPosition(positionalId, "cmp", "Competitor ID");
    return;
  }

  if (command === "export" && action === "rank-history") {
    return;
  }

  if (command === "keywords") {
    if (action === "get" || action === "update" || action === "delete") {
      assertOptionalPosition(positionalId, "kw", "Keyword ID");
    }
    if (action === "bulk") {
      assertFlagIds(args, "id", "kw", "keyword ID");
      assertCommaSeparatedFlagIds(args, "ids", "kw", "keyword ID");
    }
    return;
  }

  if (command === "link") {
    assertProjectReference(action ?? getStringFlag(args, "project"), "Project reference");
    return;
  }

  if (command === "me" && action === "tokens" && positionalId === "revoke") {
    const tokenId = args.positionals[3];
    assertOptionalPosition(tokenId, "pat", "Personal access token ID");
    return;
  }

  if (command === "projects") {
    if (action === "get" || action === "update" || action === "delete" || action === "defaults") {
      assertOptionalPosition(positionalId, "prj", "Project ID");
    }
    if (action === "use" || action === "switch") {
      assertProjectReference(positionalId ?? getStringFlag(args, "project"), "Project reference");
    }
    return;
  }

  if (command === "sitemaps" && (action === "enable" || action === "disable")) {
    assertOptionalPosition(positionalId, "prj", "Sitemap monitor ID");
    return;
  }

  if (command === "team") {
    if (action === "revoke" || action === "resend-invite") {
      assertOptionalPosition(positionalId, "inv", "Team invite ID");
    }
    if (action === "set-role" || action === "remove") {
      assertOptionalPosition(positionalId, "mbr", "Team member ID");
    }
    return;
  }

  if (command === "tokens" && action === "revoke") {
    assertOptionalPosition(positionalId, "ferry", "Migration token ID");
    return;
  }

  if (command === "views" && action === "delete") {
    assertOptionalPosition(positionalId, "viw", "Saved view ID");
  }
}
