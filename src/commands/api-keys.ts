import type { ApiKey } from "@bisibility/sdk";
import { renderJson, renderKeyValues, renderTable } from "../format.js";
import { getStringFlag, hasFlag } from "../parser.js";
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
      const options = { ...paginationOptions(ctx.args), projectId };
      const response = await listOrAll(
        () => client.apiKeys.list(options),
        (cursor) => client.apiKeys.iterate({ ...options, cursor }),
        hasFlag(ctx.args, "all"),
      );
      return hasFlag(ctx.args, "json")
        ? renderJson(response)
        : renderTable(response.data, apiKeyColumns());
    }
    const options = paginationOptions(ctx.args);
    const response = await listOrAll(
      () => client.apiKeys.list(options),
      (cursor) => client.apiKeys.iterate({ ...options, cursor }),
      hasFlag(ctx.args, "all"),
    );
    return hasFlag(ctx.args, "json")
      ? renderJson(response)
      : renderTable(response.data, apiKeyColumns());
  }

  if (action === "create") {
    const name = required(getStringFlag(ctx.args, "name"), "api-keys create requires --name.");
    let result: Awaited<ReturnType<typeof client.apiKeys.create>>;
    if (scoped) {
      const projectId = await resolveProjectId(client, ctx, settings.projectId);
      result = await client.apiKeys.create({ name }, { projectId });
    } else {
      result = await client.apiKeys.create({ name });
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
    const result = await client.apiKeys.revoke(keyId);
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
