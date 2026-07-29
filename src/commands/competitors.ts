import type { Competitor } from "@bisibility/sdk";
import { renderJson, renderKeyValues, renderTable } from "../format.js";
import { getStringFlag, hasFlag } from "../parser.js";
import { assertPublicId } from "../public-id.js";

import {
  CliError,
  type CommandContext,
  collectPaginated,
  paginationOptions,
  required,
  resolveProjectId,
  settingsAndClient,
  yesNo,
} from "../context.js";

export function competitorColumns() {
  return [
    { header: "id", value: (competitor: Competitor) => competitor.id },
    { header: "domain", value: (competitor: Competitor) => competitor.domain },
    { header: "label", value: (competitor: Competitor) => competitor.label },
    { header: "initials", value: (competitor: Competitor) => competitor.initials },
  ];
}

export async function commandCompetitors(ctx: CommandContext, rest: readonly string[]) {
  const action = rest[0] ?? "list";
  const { client, settings } = await settingsAndClient(ctx);

  if (action === "list") {
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const response = await collectPaginated(
      (options) => client.listCompetitors(projectId, options),
      paginationOptions(ctx.args),
      hasFlag(ctx.args, "all"),
    );
    return hasFlag(ctx.args, "json")
      ? renderJson(response)
      : renderTable(response.data, competitorColumns());
  }

  if (action === "add") {
    const domain = required(rest[1], "Pass a competitor domain.");
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const label = getStringFlag(ctx.args, "label");
    const result = await client.addCompetitor(projectId, {
      domain,
      ...(label ? { label } : {}),
    });
    if (hasFlag(ctx.args, "json")) {
      return renderJson(result);
    }
    return renderKeyValues([
      ["competitor", result.id],
      ["domain", result.domain],
      ["label", result.label],
    ]);
  }

  if (action === "remove") {
    const competitorId = assertPublicId(
      required(rest[1], "Pass a competitor ID."),
      "cmp",
      "Competitor ID",
    );
    const result = hasFlag(ctx.args, "global")
      ? await client.removeCompetitorById(competitorId)
      : await client.removeCompetitor(
          await resolveProjectId(client, ctx, settings.projectId),
          competitorId,
        );
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues([["removed", yesNo(result.removed)]]);
  }

  throw new CliError("Competitors command must be list, add, or remove.");
}

export const handlers = { default: commandCompetitors };
