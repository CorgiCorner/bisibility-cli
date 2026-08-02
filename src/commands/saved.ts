import type { SavedKeyword } from "@bisibility/sdk";
import { renderJson, renderKeyValues, renderTable } from "../format.js";
import { hasFlag } from "../parser.js";
import { assertPublicId } from "../public-id.js";

import {
  CliError,
  type CommandContext,
  listOrAll,
  paginationOptions,
  required,
  resolveProjectId,
  settingsAndClient,
} from "../context.js";

export function savedKeywordColumns() {
  return [
    { header: "id", value: (keyword: SavedKeyword) => keyword.id },
    { header: "keyword", value: (keyword: SavedKeyword) => keyword.text },
    { header: "location", value: (keyword: SavedKeyword) => keyword.location },
    { header: "volume", value: (keyword: SavedKeyword) => keyword.volume ?? "" },
    { header: "difficulty", value: (keyword: SavedKeyword) => keyword.difficulty ?? "" },
    { header: "saved_at", value: (keyword: SavedKeyword) => keyword.saved_at },
  ];
}

export async function commandSaved(ctx: CommandContext, rest: readonly string[]) {
  const action = rest[0] ?? "list";
  const { client, settings } = await settingsAndClient(ctx);
  const projectId = await resolveProjectId(client, ctx, settings.projectId);

  if (action === "list") {
    const options = paginationOptions(ctx.args);
    const response = await listOrAll(
      () => client.keywords.saved.list(projectId, options),
      (cursor) => client.keywords.saved.iterate(projectId, { ...options, cursor }),
      hasFlag(ctx.args, "all"),
    );
    return hasFlag(ctx.args, "json")
      ? renderJson(response)
      : renderTable(response.data, savedKeywordColumns());
  }

  if (action === "add") {
    const keywords = rest
      .slice(1)
      .map((keyword) => keyword.trim())
      .filter(Boolean);
    required(keywords[0], "Pass at least one keyword to save.");
    const result = await client.keywords.saved.create(projectId, { keywords });
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues([
          ["saved", result.saved_count],
          ["skipped", result.duplicate_count],
        ]);
  }

  if (action === "delete") {
    const savedKeywordId = assertPublicId(
      required(rest[1], "Pass a saved keyword ID."),
      "svkw",
      "Saved keyword ID",
    );
    const result = await client.keywords.saved.delete(projectId, savedKeywordId);
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues([["removed", result.removed_count]]);
  }

  throw new CliError("Saved command must be list, add, or delete.");
}

export const handlers = { default: commandSaved };
