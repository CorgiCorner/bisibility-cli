import type { SavedView } from "@bisibility/sdk";
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
    const options = paginationOptions(ctx.args);
    const response = await listOrAll(
      () => client.savedViews.list(projectId, options),
      (cursor) => client.savedViews.iterate(projectId, { ...options, cursor }),
      hasFlag(ctx.args, "all"),
    );
    return hasFlag(ctx.args, "json")
      ? renderJson(response)
      : renderTable(response.data, savedViewColumns());
  }

  if (action === "create") {
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const result = await client.savedViews.create(projectId, await savedViewInput(ctx));
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
      ? await client.savedViews.delete(viewId)
      : await client.savedViews.delete({
          id: viewId,
          projectId: await resolveProjectId(client, ctx, settings.projectId),
        });
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues([["deleted", yesNo(result.deleted)]]);
  }

  throw new CliError("Views command must be list, create, or delete.");
}

export const handlers = { default: commandViews };
