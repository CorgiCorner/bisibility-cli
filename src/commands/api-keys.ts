import type { ApiKey } from "@bisibility/sdk";
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
} from "../context.js";

export function apiKeyColumns() {
  return [
    { header: "id", value: (key: ApiKey) => key.id },
    { header: "name", value: (key: ApiKey) => key.name },
    { header: "prefix", value: (key: ApiKey) => key.prefix },
    { header: "created_at", value: (key: ApiKey) => key.created_at },
    { header: "last_used_at", value: (key: ApiKey) => key.last_used_at },
    { header: "revoked_at", value: (key: ApiKey) => key.revoked_at },
  ];
}

export async function commandApiKeys(ctx: CommandContext, rest: readonly string[]) {
  const action = rest[0] ?? "list";
  const { client, settings } = await settingsAndClient(ctx);
  const scoped = hasFlag(ctx.args, "project") || Boolean(settings.projectId);

  if (action === "list") {
    if (scoped) {
      const projectId = await resolveProjectId(client, ctx, settings.projectId);
      const response = await collectPaginated(
        (options) => client.listProjectApiKeys(projectId, options),
        paginationOptions(ctx.args),
        hasFlag(ctx.args, "all"),
      );
      return hasFlag(ctx.args, "json")
        ? renderJson(response)
        : renderTable(response.data, apiKeyColumns());
    }
    const response = await collectPaginated(
      (options) => client.listApiKeys(options),
      paginationOptions(ctx.args),
      hasFlag(ctx.args, "all"),
    );
    return hasFlag(ctx.args, "json")
      ? renderJson(response)
      : renderTable(response.data, apiKeyColumns());
  }

  if (action === "create") {
    const name = required(getStringFlag(ctx.args, "name"), "api-keys create requires --name.");
    let result: Awaited<ReturnType<typeof client.createApiKey>>;
    if (scoped) {
      const projectId = await resolveProjectId(client, ctx, settings.projectId);
      result = await client.createProjectApiKey(projectId, { name });
    } else {
      result = await client.createApiKey({ name });
    }
    if (hasFlag(ctx.args, "json")) {
      return renderJson(result);
    }
    return renderKeyValues([
      ["key", result.id],
      ["name", result.name],
      ["prefix", result.prefix],
      ["token", result.token],
    ]);
  }

  if (action === "revoke") {
    const keyId = assertPublicId(required(rest[1], "Pass an API key ID."), "key", "API key ID");
    const result = await client.revokeApiKey(keyId);
    if (hasFlag(ctx.args, "json")) {
      return renderJson(result);
    }
    return renderKeyValues([
      ["key", result.id],
      ["revoked", result.revoked_at],
    ]);
  }

  throw new CliError("Api-keys command must be list, create, or revoke.");
}

export const handlers = { default: commandApiKeys };
