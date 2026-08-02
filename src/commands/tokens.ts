import type { ActiveMigrationToken, IssuedMigrationToken, MigrationScope } from "@bisibility/sdk";
import { renderJson, renderKeyValues, renderTable } from "../format.js";
import { type ParsedArgs, getStringFlag, hasFlag } from "../parser.js";
import { assertPublicId } from "../public-id.js";

import {
  CliError,
  type CommandContext,
  listOrAll,
  paginationOptions,
  required,
  resolveProjectId,
  settingsAndClient,
  yesNo,
} from "../context.js";

export function migrationTokenColumns() {
  return [
    { header: "id", value: (token: ActiveMigrationToken) => token.id },
    { header: "scope", value: (token: ActiveMigrationToken) => token.scope },
    { header: "single_use", value: (token: ActiveMigrationToken) => yesNo(token.single_use) },
    { header: "expires_at", value: (token: ActiveMigrationToken) => token.expires_at },
    { header: "created_by", value: (token: ActiveMigrationToken) => token.created_by?.email },
  ];
}

export function migrationScope(args: ParsedArgs) {
  const scope = getStringFlag(args, "scope");
  if (scope === undefined) {
    return undefined;
  }
  if (scope !== "full" && scope !== "keywords") {
    throw new CliError("--scope must be full or keywords.");
  }
  return scope satisfies MigrationScope;
}

export function issuedMigrationTokenSummary(result: IssuedMigrationToken) {
  return renderKeyValues([
    ["token id", result.id],
    ["scope", result.scope],
    ["single use", yesNo(result.single_use)],
    ["expires", result.expires_at],
    ["token", result.token],
  ]);
}

export async function commandTokens(ctx: CommandContext, rest: readonly string[]) {
  const action = rest[0] ?? "list";
  const { client, settings } = await settingsAndClient(ctx);

  if (action === "list") {
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const options = paginationOptions(ctx.args);
    const response = await listOrAll(
      () => client.imports.tokens.list(projectId, options),
      (cursor) => client.imports.tokens.iterate(projectId, { ...options, cursor }),
      hasFlag(ctx.args, "all"),
    );
    return hasFlag(ctx.args, "json")
      ? renderJson(response)
      : renderTable(response.data, migrationTokenColumns());
  }

  if (action === "mint") {
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const scope = migrationScope(ctx.args);
    const result = await client.imports.tokens.create(projectId, scope ? { scope } : {});
    return hasFlag(ctx.args, "json") ? renderJson(result) : issuedMigrationTokenSummary(result);
  }

  if (action === "revoke") {
    const tokenId = assertPublicId(
      required(rest[1], "Pass a migration token ID."),
      "ferry",
      "Migration token ID",
    );
    const result = hasFlag(ctx.args, "global")
      ? await client.imports.tokens.revoke(tokenId)
      : await client.imports.tokens.revoke({
          id: tokenId,
          projectId: await resolveProjectId(client, ctx, settings.projectId),
        });
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues([
          ["token", result.id],
          ["revoked", result.revoked_at],
        ]);
  }

  throw new CliError("Tokens command must be list, mint, or revoke.");
}

export const handlers = { default: commandTokens };
