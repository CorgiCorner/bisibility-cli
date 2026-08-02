import type { LocationSuggestion } from "@bisibility/sdk";
import {
  CliError,
  type CommandContext,
  parsePositiveInt,
  required,
  settingsAndClient,
} from "../context.js";
import { renderJson, renderTable } from "../format.js";
import { getStringFlag, hasFlag } from "../parser.js";

function locationColumns() {
  return [
    { header: "Location", value: (row: LocationSuggestion) => row.display_name },
    { header: "Kind", value: (row: LocationSuggestion) => row.kind },
    { header: "Country", value: (row: LocationSuggestion) => row.country_code },
    { header: "Location key", value: (row: LocationSuggestion) => row.location_key },
    { header: "Language", value: (row: LocationSuggestion) => row.language_label },
  ];
}

export async function commandLocations(ctx: CommandContext, rest: readonly string[]) {
  if (rest[0] !== "search") throw new CliError("Locations command must be search.");
  const query = required(rest[1], "Pass location search text.");
  const limit = parsePositiveInt(getStringFlag(ctx.args, "limit"), "--limit", 20);
  if (limit > 100) throw new CliError("--limit must not exceed 100.");
  const country = getStringFlag(ctx.args, "country");
  const { client } = await settingsAndClient(ctx);
  const result = await client.locations.search({
    ...(country ? { country } : {}),
    limit,
    q: query,
  });
  return hasFlag(ctx.args, "json")
    ? renderJson(result)
    : renderTable(result.data, locationColumns());
}

export const handlers = { default: commandLocations };
