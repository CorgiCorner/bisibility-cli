import type { SavedView } from "@bisibility/sdk";
import { renderJson, renderKeyValues, renderTable } from "../format.js";
import { hasFlag } from "../parser.js";
import { assertPublicId } from "../public-id.js";

import {
  CliError,
  type CommandContext,
  collectPaginated,
  paginationOptions,
  required,
  resolveProjectId,
  savedViewInput,
  settingsAndClient,
  yesNo,
} from "../context.js";

export function savedViewColumns() {
  return [
    { header: "id", value: (view: SavedView) => view.id },
    { header: "name", value: (view: SavedView) => view.name },
    { header: "created_by", value: (view: SavedView) => view.created_by_id },
    { header: "created_at", value: (view: SavedView) => view.created_at },
  ];
}

export async function commandViews(ctx: CommandContext, rest: readonly string[]) {
  const action = rest[0] ?? "list";
  const { client, settings } = await settingsAndClient(ctx);

  if (action === "list") {
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const response = await collectPaginated(
      (options) => client.listSavedViews(projectId, options),
      paginationOptions(ctx.args),
      hasFlag(ctx.args, "all"),
    );
    return hasFlag(ctx.args, "json")
      ? renderJson(response)
      : renderTable(response.data, savedViewColumns());
  }

  if (action === "create") {
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const result = await client.createSavedView(projectId, await savedViewInput(ctx));
    if (hasFlag(ctx.args, "json")) {
      return renderJson(result);
    }
    return renderKeyValues([
      ["view", result.id],
      ["name", result.name],
    ]);
  }

  if (action === "delete") {
    const viewId = assertPublicId(
      required(rest[1], "Pass a saved view ID."),
      "viw",
      "Saved view ID",
    );
    const result = hasFlag(ctx.args, "global")
      ? await client.deleteSavedViewById(viewId)
      : await client.deleteSavedView(
          await resolveProjectId(client, ctx, settings.projectId),
          viewId,
        );
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues([["deleted", yesNo(result.deleted)]]);
  }

  throw new CliError("Views command must be list, create, or delete.");
}

export const handlers = { default: commandViews };
