import { removeProjectLink, writeProjectLink } from "../config.js";
import { renderJson, renderKeyValues } from "../format.js";
import { getStringFlag, hasFlag } from "../parser.js";

import { CliError, type CommandContext, chooseProject, settingsAndClient } from "../context.js";

export async function commandLink(ctx: CommandContext, rest: readonly string[]) {
  const { client } = await settingsAndClient(ctx);
  const response = await client.projects.list();
  const project = await chooseProject(
    ctx,
    response.data,
    rest[0] ?? getStringFlag(ctx.args, "project"),
  );
  const linked = await writeProjectLink(project.id, ctx.deps);
  return hasFlag(ctx.args, "json")
    ? renderJson({ path: linked.path, project })
    : renderKeyValues([
        ["linked project", project.id],
        ["name", project.name],
        ["domain", project.domain],
        ["config", linked.path],
      ]);
}

export async function commandUnlink(ctx: CommandContext) {
  const path = await removeProjectLink(ctx.deps);
  if (!path) {
    throw new CliError("No .bisibility/project.json link was found in this directory tree.");
  }
  return hasFlag(ctx.args, "json") ? renderJson({ path, unlinked: true }) : `Unlinked ${path}\n`;
}

export const handlers = { link: commandLink, unlink: commandUnlink };
